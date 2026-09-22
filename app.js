"use strict";

// A interface e a API compartilharão o endereço pelo servidor Nginx.
// Configuraremos esse encaminhamento na etapa do Docker.
const API_BASE = "/api";

const elemento = (id) => document.getElementById(id);

const formulario = elemento("form-chamado");
const lista = elemento("lista-chamados");
const estadoLista = elemento("estado-lista");
const mensagem = elemento("mensagem");
const botaoSalvar = elemento("salvar-chamado");
const botaoAtualizar = elemento("atualizar-lista");
const botaoBuscarCep = elemento("buscar-cep");

const campos = [
  "titulo",
  "descricao",
  "categoria",
  "prioridade",
  "status",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
];

const nomesStatus = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
};

const nomesPrioridade = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

const nomesCategoria = {
  hardware: "Hardware",
  software: "Software",
  rede: "Rede",
  impressora: "Impressora",
  outros: "Outros",
};

let chamados = [];
let dadosCarregados = false;
let carregando = false;
let salvando = false;
let consultandoCep = false;
let excluindo = false;

// Centraliza as requisições HTTP e o tratamento de erros.
async function requisitar(caminho, opcoes = {}) {
  if (window.location.protocol === "file:") {
    throw new Error(
      "Abra a interface pelo servidor local. " +
      "O acesso direto ao arquivo permite apenas visualizar a página."
    );
  }

  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 15000);

  try {
    const resposta = await fetch(`${API_BASE}${caminho}`, {
      ...opcoes,
      headers: {
        Accept: "application/json",
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...opcoes.headers,
      },
      signal: controlador.signal,
    });

    const texto = await resposta.text();
    let dados = null;

    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch {
        throw new Error(
          "O servidor não retornou JSON. Verifique se a API está disponível."
        );
      }
    }

    if (!resposta.ok) {
      const detalhe = dados?.erro || dados?.message;

      throw new Error(
        typeof detalhe === "string"
          ? detalhe
          : `Não foi possível concluir a operação (HTTP ${resposta.status}).`
      );
    }

    return dados;
  } catch (erro) {
    if (erro.name === "AbortError") {
      throw new Error(
        "O servidor demorou para responder. Tente novamente."
      );
    }

    if (erro instanceof TypeError) {
      throw new Error(
        "Não foi possível conectar à API. Verifique se o back-end está ligado."
      );
    }

    throw erro;
  } finally {
    clearTimeout(limite);
  }
}

function mostrarMensagem(texto, tipo = "info") {
  mensagem.textContent = texto;
  mensagem.className = `message message-${tipo}`;
  mensagem.hidden = false;
}

function limparMensagem() {
  mensagem.hidden = true;
  mensagem.textContent = "";
}

function mostrarMensagemCep(texto, tipo = "") {
  const destino = elemento("cep-mensagem");
  destino.textContent = texto;
  destino.className = tipo;
}

// textContent evita interpretar dados dos chamados como código HTML.
function criarElemento(tag, classe, texto) {
  const novo = document.createElement(tag);
  novo.className = classe;

  if (texto !== undefined) {
    novo.textContent = texto;
  }

  return novo;
}

function atualizarContadores() {
  elemento("total-chamados").textContent = chamados.length;

  elemento("total-abertos").textContent =
    chamados.filter((chamado) => chamado.status === "aberto").length;

  elemento("total-em-atendimento").textContent =
    chamados.filter(
      (chamado) => chamado.status === "em_atendimento"
    ).length;

  elemento("total-concluidos").textContent =
    chamados.filter((chamado) => chamado.status === "concluido").length;
}

function criarCard(chamado) {
  const card = criarElemento("article", "ticket-card");
  const cabecalho = criarElemento("div", "ticket-header");
  const identificacao = criarElemento("div", "");

  identificacao.append(
    criarElemento("span", "ticket-id", `Chamado #${chamado.id}`),
    criarElemento("h3", "ticket-title", chamado.titulo)
  );

  cabecalho.append(identificacao);

  const etiquetas = criarElemento("div", "ticket-badges");

  const statusValido = Object.hasOwn(nomesStatus, chamado.status);
  const prioridadeValida = Object.hasOwn(
    nomesPrioridade,
    chamado.prioridade
  );

  etiquetas.append(
    criarElemento(
      "span",
      statusValido ? `badge badge-${chamado.status}` : "badge",
      statusValido ? nomesStatus[chamado.status] : "Status desconhecido"
    ),
    criarElemento(
      "span",
      prioridadeValida ? `badge badge-${chamado.prioridade}` : "badge",
      prioridadeValida
        ? `Prioridade ${nomesPrioridade[chamado.prioridade].toLowerCase()}`
        : "Prioridade desconhecida"
    ),
    criarElemento(
      "span",
      "badge",
      nomesCategoria[chamado.categoria] || "Outros"
    )
  );

  const endereco = [
    chamado.logradouro,
    chamado.numero,
    chamado.complemento,
    chamado.bairro,
    chamado.cidade,
    chamado.uf,
    chamado.cep ? `CEP ${chamado.cep}` : "",
  ].filter(Boolean).join(", ");

  const acoes = criarElemento("div", "ticket-actions");

  const editar = criarElemento(
    "button",
    "button button-secondary",
    "Editar"
  );
  editar.type = "button";
  editar.setAttribute("aria-label", `Editar chamado ${chamado.id}`);
  editar.addEventListener("click", () => iniciarEdicao(chamado));

  const excluir = criarElemento(
    "button",
    "button button-danger",
    "Excluir"
  );
  excluir.type = "button";
  excluir.setAttribute("aria-label", `Excluir chamado ${chamado.id}`);
  excluir.addEventListener("click", () => excluirChamado(chamado, excluir));

  acoes.append(editar, excluir);

  card.append(
    cabecalho,
    etiquetas,
    criarElemento("p", "ticket-description", chamado.descricao),
    criarElemento("p", "ticket-address", `Local: ${endereco}`),
    acoes
  );

  return card;
}

function renderizarLista() {
  lista.replaceChildren();

  if (!dadosCarregados) {
    return;
  }

  const status = elemento("filtro-status").value;
  const prioridade = elemento("filtro-prioridade").value;

  const filtrados = chamados.filter((chamado) => {
    const correspondeStatus = !status || chamado.status === status;
    const correspondePrioridade =
      !prioridade || chamado.prioridade === prioridade;

    return correspondeStatus && correspondePrioridade;
  });

  estadoLista.hidden = filtrados.length > 0;
  estadoLista.textContent = chamados.length === 0
    ? "Nenhum chamado cadastrado. Use o formulário para começar."
    : "Nenhum chamado corresponde aos filtros selecionados.";

  const fragmento = document.createDocumentFragment();

  filtrados.forEach((chamado) => {
    fragmento.append(criarCard(chamado));
  });

  lista.append(fragmento);
}

async function carregarChamados() {
  if (carregando) {
    return false;
  }

  carregando = true;
  botaoAtualizar.disabled = true;
  botaoAtualizar.textContent = "Carregando…";
  lista.setAttribute("aria-busy", "true");

  try {
    const dados = await requisitar("/chamados");

    // O contrato da API será: { "chamados": [...] }.
    if (!dados || !Array.isArray(dados.chamados)) {
      throw new Error("A API retornou uma lista de chamados inválida.");
    }

    chamados = dados.chamados;
    dadosCarregados = true;
    atualizarContadores();
    renderizarLista();

    return true;
  } catch (erro) {
    mostrarMensagem(erro.message, "error");

    if (!dadosCarregados) {
      estadoLista.hidden = false;
      estadoLista.textContent =
        "Não foi possível carregar os chamados. Tente atualizar a lista.";
    }

    return false;
  } finally {
    carregando = false;
    botaoAtualizar.disabled = false;
    botaoAtualizar.textContent = "Atualizar";
    lista.setAttribute("aria-busy", "false");
  }
}

function limparFormulario() {
  formulario.reset();
  elemento("chamado-id").value = "";
  elemento("titulo-formulario").textContent = "Novo chamado";
  botaoSalvar.textContent = "Salvar chamado";
  elemento("cancelar-edicao").hidden = true;
  mostrarMensagemCep("");
}

function iniciarEdicao(chamado) {
  if (salvando || consultandoCep) {
    return;
  }

  limparMensagem();

  campos.forEach((campo) => {
    elemento(campo).value = chamado[campo] ?? "";
  });

  elemento("chamado-id").value = chamado.id;
  elemento("titulo-formulario").textContent =
    `Editar chamado #${chamado.id}`;
  botaoSalvar.textContent = "Salvar alterações";
  elemento("cancelar-edicao").hidden = false;
  mostrarMensagemCep("");

  elemento("titulo").focus();
}

function bloquearFormulario(bloqueado) {
  formulario.querySelectorAll("input, select, textarea, button")
    .forEach((controle) => {
      controle.disabled = bloqueado;
    });
}

async function salvarChamado(evento) {
  evento.preventDefault();

  if (salvando || consultandoCep || excluindo || carregando) {
    mostrarMensagem(
      "Aguarde a operação atual terminar antes de salvar.",
      "info"
    );
    return;
  }

  // Remove espaços desnecessários antes da validação.
  campos.forEach((campo) => {
    elemento(campo).value = elemento(campo).value.trim();
  });

  if (!formulario.reportValidity()) {
    return;
  }

  const id = elemento("chamado-id").value;
  const dados = {};

  campos.forEach((campo) => {
    dados[campo] = elemento(campo).value;
  });

  dados.cep = dados.cep.replace(/\D/g, "");

  salvando = true;
  limparMensagem();
  bloquearFormulario(true);
  botaoSalvar.textContent = "Salvando…";

  try {
    await requisitar(
      id ? `/chamados/${encodeURIComponent(id)}` : "/chamados",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(dados),
      }
    );

    limparFormulario();

    const atualizou = await carregarChamados();

    mostrarMensagem(
      atualizou
        ? (id ? "Chamado atualizado com sucesso!" : "Chamado criado com sucesso!")
        : "Chamado salvo, mas a lista não pôde ser atualizada. Clique em Atualizar.",
      atualizou ? "success" : "info"
    );
  } catch (erro) {
    mostrarMensagem(erro.message, "error");
  } finally {
    salvando = false;
    bloquearFormulario(false);
    botaoSalvar.textContent = elemento("chamado-id").value
      ? "Salvar alterações"
      : "Salvar chamado";
  }
}

async function excluirChamado(chamado, botao) {
  if (excluindo || salvando || carregando || consultandoCep) {
    mostrarMensagem("Aguarde a operação atual terminar.", "info");
    return;
  }

  const confirmou = window.confirm(
    `Excluir o chamado #${chamado.id} — "${chamado.titulo}"?\n` +
    "Esta ação não pode ser desfeita."
  );

  if (!confirmou) {
    return;
  }

  excluindo = true;
  botao.disabled = true;
  botao.textContent = "Excluindo…";
  limparMensagem();

  try {
    await requisitar(`/chamados/${encodeURIComponent(chamado.id)}`, {
      method: "DELETE",
    });

    if (elemento("chamado-id").value === String(chamado.id)) {
      limparFormulario();
    }

    // Remove também da lista local caso a atualização seguinte falhe.
    chamados = chamados.filter((item) => item.id !== chamado.id);
    atualizarContadores();
    renderizarLista();

    const atualizou = await carregarChamados();

    mostrarMensagem(
      atualizou
        ? "Chamado excluído com sucesso!"
        : "Chamado excluído. Atualize a lista para sincronizar os demais dados.",
      atualizou ? "success" : "info"
    );
  } catch (erro) {
    mostrarMensagem(erro.message, "error");
  } finally {
    excluindo = false;
    botao.disabled = false;
    botao.textContent = "Excluir";
  }
}

async function buscarCep() {
  if (consultandoCep || salvando || excluindo) {
    return;
  }

  const cep = elemento("cep").value.replace(/\D/g, "");

  if (cep.length !== 8) {
    mostrarMensagemCep("Informe um CEP com oito dígitos.", "error");
    elemento("cep").focus();
    return;
  }

  consultandoCep = true;
  bloquearFormulario(true);
  botaoBuscarCep.textContent = "Buscando…";
  mostrarMensagemCep("Consultando endereço…");

  try {
    // A API própria fará a chamada ao ViaCEP.
    const endereco = await requisitar(`/cep/${cep}`);

    if (!endereco || !endereco.localidade || !endereco.uf) {
      throw new Error("A consulta não retornou um endereço válido.");
    }

    elemento("cep").value = `${cep.slice(0, 5)}-${cep.slice(5)}`;
    elemento("logradouro").value = endereco.logradouro || "";
    elemento("bairro").value = endereco.bairro || "";
    elemento("cidade").value = endereco.localidade;
    elemento("uf").value = endereco.uf;

    mostrarMensagemCep(
      "Endereço encontrado. Confira os dados e complete os campos restantes.",
      "success"
    );
  } catch (erro) {
    mostrarMensagemCep(erro.message, "error");
  } finally {
    consultandoCep = false;
    bloquearFormulario(false);
    botaoBuscarCep.textContent = "Buscar CEP";
  }
}

// Eventos da interface.
formulario.addEventListener("submit", salvarChamado);
botaoBuscarCep.addEventListener("click", buscarCep);

elemento("filtro-status").addEventListener("change", renderizarLista);
elemento("filtro-prioridade").addEventListener("change", renderizarLista);

elemento("cancelar-edicao").addEventListener("click", () => {
  if (!salvando && !consultandoCep) {
    limparFormulario();
  }
});

document.querySelector('a[href="#formulario"]')
  .addEventListener("click", (evento) => {
    evento.preventDefault();

    if (salvando || consultandoCep) {
      return;
    }

    limparFormulario();
    elemento("titulo").focus();
  });

botaoAtualizar.addEventListener("click", () => {
  if (!salvando && !excluindo) {
    limparMensagem();
    carregarChamados();
  }
});

// Abrir o HTML diretamente serve apenas para conferir o visual.
if (window.location.protocol === "file:") {
  mostrarMensagem(
    "Prévia visual: abra a interface pelo servidor local para conectar à API.",
    "info"
  );
} else {
  carregarChamados();
}