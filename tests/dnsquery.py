"""Consulta DNS minima (sin dependencias) contra un servidor concreto.

Se usa para preguntar a los nameservers autoritativos de Cloudflare que
registros existen realmente en la zona, distinguiendolos de la cache de los
resolvers recursivos.
"""
import socket
import struct
import sys

TYPES = {1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA'}


def encode_name(name):
    out = b''
    for label in name.rstrip('.').split('.'):
        out += bytes([len(label)]) + label.encode()
    return out + b'\x00'


def read_name(data, offset):
    labels = []
    jumped = False
    end = offset
    while True:
        length = data[offset]
        if length & 0xC0 == 0xC0:
            pointer = struct.unpack('!H', data[offset:offset + 2])[0] & 0x3FFF
            if not jumped:
                end = offset + 2
            offset = pointer
            jumped = True
            continue
        if length == 0:
            offset += 1
            if not jumped:
                end = offset
            break
        labels.append(data[offset + 1:offset + 1 + length].decode('latin-1'))
        offset += length + 1
    return '.'.join(labels) + '.', end


def query(server, name, qtype, timeout=6):
    qid = 0x1234
    header = struct.pack('!HHHHHH', qid, 0x0100, 1, 0, 0, 0)
    packet = header + encode_name(name) + struct.pack('!HH', qtype, 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (server, 53))
        data, _ = sock.recvfrom(4096)
    except socket.timeout:
        return None, ['timeout']
    finally:
        sock.close()

    flags = struct.unpack('!H', data[2:4])[0]
    rcode = flags & 0x0F
    qd, an = struct.unpack('!HH', data[4:8])
    offset = 12
    for _ in range(qd):
        _, offset = read_name(data, offset)
        offset += 4
    answers = []
    for _ in range(an):
        _, offset = read_name(data, offset)
        rtype, _rclass, _ttl, rdlen = struct.unpack('!HHIH', data[offset:offset + 10])
        offset += 10
        rdata = data[offset:offset + rdlen]
        offset += rdlen
        if rtype == 1:
            value = socket.inet_ntoa(rdata)
        elif rtype in (2, 5, 12):
            value, _ = read_name(data, offset - rdlen)
        elif rtype == 15:
            value = f"pref {struct.unpack('!H', rdata[:2])[0]} " + read_name(data, offset - rdlen + 2)[0]
        elif rtype == 16:
            value = rdata[1:1 + rdata[0]].decode('latin-1', 'replace')
        elif rtype == 6:
            value = 'rdata:' + rdata.hex()
        else:
            value = rdata.hex()
        answers.append(f"{TYPES.get(rtype, rtype)}\t{value}")
    return rcode, answers


if __name__ == '__main__':
    server = sys.argv[1]
    name = sys.argv[2]
    qtypes = {'A': 1, 'NS': 2, 'CNAME': 5, 'MX': 15, 'TXT': 16, 'AAAA': 28}
    for label in sys.argv[3:]:
        rcode, answers = query(server, name, qtypes.get(label.upper(), 1))
        print(f"--- {name} {label.upper()} (server {server}, rcode {rcode}) ---")
        if not answers:
            print("   (sin registros)")
        for a in answers:
            print("   ", a)
