/* app.js — adicionado em 2026, com ajuda de IA, só para a demonstração funcionar.
   O visual e o HTML/CSS da tela de login são o projeto original de 2024.

   Como funciona: não existe servidor nem banco de dados. As contas ficam salvas
   só no navegador de quem está testando (localStorage) e a senha é guardada
   embaralhada (SHA-256 com sal), nunca em texto. Cadastrar, entrar, ver, editar
   e excluir a conta funcionam de verdade, mas só neste navegador. */
(function () {
  'use strict';

  var ICONE_PESSOA = 'https://img.icons8.com/ios-glyphs/30/000000/person-male.png';
  var ICONE_CADEADO = 'https://img.icons8.com/material-rounded/24/000000/lock--v1.png';
  var ICONE_OLHO = 'https://img.icons8.com/material-outlined/24/000000/visible.png';
  var CHAVE_USUARIOS = 'crud_demo_usuarios';
  var CHAVE_SESSAO = 'crud_demo_sessao';

  /* ---------- armazenamento (com reserva em memória, caso o navegador bloqueie) ---------- */
  function criarArmazem(tipo) {
    var memoria = {};
    try {
      var s = window[tipo];
      s.setItem('__teste', '1'); s.removeItem('__teste');
      return s;
    } catch (e) {
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(memoria, k) ? memoria[k] : null; },
        setItem: function (k, v) { memoria[k] = String(v); },
        removeItem: function (k) { delete memoria[k]; }
      };
    }
  }
  var armazem = criarArmazem('localStorage');
  var sessaoArmazem = criarArmazem('sessionStorage');

  function lerUsuarios() {
    try { return JSON.parse(armazem.getItem(CHAVE_USUARIOS) || '[]'); } catch (e) { return []; }
  }
  function salvarUsuarios(lista) { armazem.setItem(CHAVE_USUARIOS, JSON.stringify(lista)); }
  function achar(email) {
    return lerUsuarios().filter(function (u) { return u.email === email; })[0] || null;
  }

  /* ---------- senha embaralhada ---------- */
  function paraHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function gerarSal() {
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return paraHex(a.buffer);
  }
  function embaralhar(senha, sal) {
    var texto = sal + ':' + senha;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(paraHex);
    }
    var h = 5381; /* alternativa simples, só para navegadores sem suporte */
    for (var i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
    return Promise.resolve('d' + (h >>> 0).toString(16));
  }

  /* ---------- peças da tela ---------- */
  var container = document.querySelector('.container');
  var formLogin = container.querySelector('form');

  function aviso(el, texto, tipo) {
    el.textContent = texto;
    el.className = 'msg' + (tipo ? ' ' + tipo : '');
  }
  function caixa(nome, placeholder, tipo, extra) {
    return '<div class="box"><input name="' + nome + '" placeholder="' + placeholder + '" type="' + tipo + '" ' + (extra || '') + '>' +
      '<img width="24" height="24" src="' + (tipo === 'password' ? ICONE_CADEADO : ICONE_PESSOA) + '" alt="" ' +
      (tipo === 'password' ? 'data-ver="1"' : '') + '></div>';
  }

  /* mensagem e aviso no formulário de login original */
  var msgLogin = document.createElement('p');
  msgLogin.className = 'msg'; msgLogin.setAttribute('role', 'status'); msgLogin.setAttribute('aria-live', 'polite');
  formLogin.insertBefore(msgLogin, formLogin.querySelector('.submit'));

  var nota = document.createElement('p');
  nota.className = 'nota';
  nota.textContent = 'Demonstração: aqui não há servidor, as contas ficam só neste navegador. Para testar, crie uma conta com uma senha qualquer, nunca a sua senha real.';
  container.appendChild(nota);

  /* cadastro */
  var formCad = document.createElement('form');
  formCad.hidden = true; formCad.noValidate = true;
  formCad.innerHTML =
    '<h1>Criar conta</h1>' +
    caixa('nome', 'Nome', 'text', 'autocomplete="name"') +
    caixa('email', 'Email', 'email', 'autocomplete="email"') +
    caixa('senha', 'Senha (mínimo 6 caracteres)', 'password', 'autocomplete="new-password"') +
    caixa('senha2', 'Repita a senha', 'password', 'autocomplete="new-password"') +
    '<p class="msg" role="status" aria-live="polite"></p>' +
    '<button class="submit" type="submit">Cadastrar</button>' +
    '<div class="register"><p>Já tem conta? <a href="#" data-ir="login">Entrar</a></p></div>';
  container.insertBefore(formCad, nota);
  var msgCad = formCad.querySelector('.msg');

  /* painel da conta (ver, editar, excluir) */
  var painel = document.createElement('section');
  painel.className = 'painel'; painel.hidden = true;
  painel.innerHTML =
    '<h1 id="ola">Olá!</h1>' +
    '<dl class="perfil">' +
      '<div><dt>Nome</dt><dd id="pNome"></dd></div>' +
      '<div><dt>E-mail</dt><dd id="pEmail"></dd></div>' +
      '<div><dt>Conta criada em</dt><dd id="pData"></dd></div>' +
    '</dl>' +
    '<form id="formEditar" novalidate>' +
      caixa('nome', 'Nome', 'text', 'autocomplete="name"') +
      caixa('novaSenha', 'Nova senha (opcional)', 'password', 'autocomplete="new-password"') +
      '<p class="msg" role="status" aria-live="polite"></p>' +
      '<button class="submit" type="submit">Salvar alterações</button>' +
    '</form>' +
    '<div class="acoes">' +
      '<button class="sec" id="btnSair" type="button">Sair</button>' +
      '<button class="sec perigo" id="btnExcluir" type="button">Excluir minha conta</button>' +
    '</div>';
  container.insertBefore(painel, nota);
  var formEditar = painel.querySelector('#formEditar');
  var msgEditar = formEditar.querySelector('.msg');

  function mostrar(nome) {
    formLogin.hidden = nome !== 'login';
    formCad.hidden = nome !== 'cadastro';
    painel.hidden = nome !== 'painel';
    nota.hidden = nome === 'painel';
    aviso(msgLogin, ''); aviso(msgCad, ''); aviso(msgEditar, '');
  }

  function abrirPainel(usuario) {
    sessaoArmazem.setItem(CHAVE_SESSAO, usuario.email);
    painel.querySelector('#ola').textContent = 'Olá, ' + usuario.nome.split(' ')[0] + '!';
    painel.querySelector('#pNome').textContent = usuario.nome;
    painel.querySelector('#pEmail').textContent = usuario.email;
    painel.querySelector('#pData').textContent = new Date(usuario.criadoEm).toLocaleDateString('pt-BR');
    formEditar.elements.nome.value = usuario.nome;
    formEditar.elements.novaSenha.value = '';
    mostrar('painel');
  }
  function usuarioLogado() {
    var email = sessaoArmazem.getItem(CHAVE_SESSAO);
    return email ? achar(email) : null;
  }

  /* ---------- eventos ---------- */
  /* olho para mostrar/esconder a senha nos campos novos */
  container.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('img[data-ver]') : null;
    if (!img) return;
    var campo = img.parentNode.querySelector('input');
    var escondida = campo.type === 'password';
    campo.type = escondida ? 'text' : 'password';
    img.src = escondida ? ICONE_OLHO : ICONE_CADEADO;
  });

  /* alternar entre Entrar e Cadastrar */
  formLogin.querySelector('.register a').addEventListener('click', function (e) {
    e.preventDefault(); mostrar('cadastro'); formCad.elements.nome.focus();
  });
  formCad.querySelector('[data-ir="login"]').addEventListener('click', function (e) {
    e.preventDefault(); mostrar('login'); formLogin.elements.email.focus();
  });

  /* Create: cadastrar */
  formCad.addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = formCad.elements.nome.value.trim();
    var email = formCad.elements.email.value.trim().toLowerCase();
    var s1 = formCad.elements.senha.value, s2 = formCad.elements.senha2.value;
    if (nome.length < 2) return aviso(msgCad, 'Informe seu nome.', 'erro');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso(msgCad, 'Informe um e-mail válido.', 'erro');
    if (s1.length < 6) return aviso(msgCad, 'A senha precisa ter pelo menos 6 caracteres.', 'erro');
    if (s1 !== s2) return aviso(msgCad, 'As senhas não conferem.', 'erro');
    if (achar(email)) return aviso(msgCad, 'Já existe uma conta com esse e-mail.', 'erro');
    var sal = gerarSal();
    embaralhar(s1, sal).then(function (hash) {
      var lista = lerUsuarios();
      lista.push({ nome: nome, email: email, sal: sal, hash: hash, criadoEm: new Date().toISOString() });
      salvarUsuarios(lista);
      formCad.reset();
      mostrar('login');
      formLogin.elements.email.value = email;
      formLogin.elements.senha.value = '';
      aviso(msgLogin, 'Conta criada! Agora é só entrar.', 'ok');
      formLogin.elements.senha.focus();
    });
  });

  /* Read: entrar e ver os dados (as mensagens são as mesmas do index.php original) */
  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = formLogin.elements.email.value.trim().toLowerCase();
    var senha = formLogin.elements.senha.value;
    var usuario = achar(email);
    if (!usuario) return aviso(msgLogin, 'E-mail não encontrado.', 'erro');
    embaralhar(senha, usuario.sal).then(function (hash) {
      if (hash !== usuario.hash) return aviso(msgLogin, 'Senha incorreta.', 'erro');
      aviso(msgLogin, 'Login bem-sucedido!', 'ok');
      formLogin.reset();
      abrirPainel(usuario);
    });
  });

  /* Update: editar nome e/ou trocar a senha */
  formEditar.addEventListener('submit', function (e) {
    e.preventDefault();
    var usuario = usuarioLogado();
    if (!usuario) return mostrar('login');
    var nome = formEditar.elements.nome.value.trim();
    var nova = formEditar.elements.novaSenha.value;
    if (nome.length < 2) return aviso(msgEditar, 'Informe seu nome.', 'erro');
    if (nova && nova.length < 6) return aviso(msgEditar, 'A nova senha precisa ter pelo menos 6 caracteres.', 'erro');
    function gravar(sal, hash) {
      var lista = lerUsuarios().map(function (u) {
        if (u.email !== usuario.email) return u;
        u.nome = nome; if (hash) { u.sal = sal; u.hash = hash; }
        return u;
      });
      salvarUsuarios(lista);
      abrirPainel(achar(usuario.email));
      aviso(msgEditar, nova ? 'Dados e senha atualizados.' : 'Dados atualizados.', 'ok');
    }
    if (nova) { var sal = gerarSal(); embaralhar(nova, sal).then(function (h) { gravar(sal, h); }); }
    else gravar(null, null);
  });

  /* sair */
  painel.querySelector('#btnSair').addEventListener('click', function () {
    sessaoArmazem.removeItem(CHAVE_SESSAO);
    mostrar('login');
  });

  /* Delete: excluir a conta (pede confirmação com um segundo clique) */
  var btnExcluir = painel.querySelector('#btnExcluir'), timerExcluir = null;
  btnExcluir.addEventListener('click', function () {
    if (!btnExcluir.dataset.confirmar) {
      btnExcluir.dataset.confirmar = '1';
      btnExcluir.textContent = 'Clique de novo para excluir';
      timerExcluir = setTimeout(function () {
        delete btnExcluir.dataset.confirmar; btnExcluir.textContent = 'Excluir minha conta';
      }, 4000);
      return;
    }
    clearTimeout(timerExcluir);
    delete btnExcluir.dataset.confirmar; btnExcluir.textContent = 'Excluir minha conta';
    var usuario = usuarioLogado();
    if (usuario) salvarUsuarios(lerUsuarios().filter(function (u) { return u.email !== usuario.email; }));
    sessaoArmazem.removeItem(CHAVE_SESSAO);
    mostrar('login');
    aviso(msgLogin, 'Conta excluída.', 'ok');
  });

  /* se a pessoa já entrou nesta sessão, volta direto para o painel */
  var jaEntrou = usuarioLogado();
  if (jaEntrou) abrirPainel(jaEntrou);
})();
