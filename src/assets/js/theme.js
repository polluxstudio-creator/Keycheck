/**
 * KEYCHECK — tema claro / oscuro.
 *
 * El sitio se muestra en claro por defecto. El interruptor de la cabecera
 * alterna entre los dos temas y guarda la preferencia en localStorage, de
 * modo que cada visitante mantiene la suya.
 */
(function () {
  'use strict';

  var KEY = 'kc-theme';
  var root = document.documentElement;

  function stored() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function remember(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (e) {
      /* modo privado o cookies bloqueadas: el tema funciona igual, solo no se recuerda */
    }
  }

  function paint(theme) {
    root.setAttribute('data-theme', theme);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0f12' : '#f4f6f8');

    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    // The button represents the dark theme: it is "pressed" while dark is on
    // and its label always says which theme it switches to.
    var isDark = theme === 'dark';
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute(
      'aria-label',
      isDark ? 'Switch to the light theme' : 'Switch to the dark theme'
    );
    button.setAttribute('title', isDark ? 'Switch to the light theme' : 'Switch to the dark theme');
  }

  function apply(theme) {
    paint(theme === 'dark' ? 'dark' : 'light');
  }

  // El atributo ya viene puesto por el script del <head>; aqui solo se
  // sincroniza el boton y el color de la barra del navegador.
  apply(stored() === 'dark' ? 'dark' : root.getAttribute('data-theme') || 'light');

  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
    if (!button) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    remember(next);
  });
})();
