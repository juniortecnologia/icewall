# ICEWALL como serviço do systemd

O painel roda como **serviço de usuário** do systemd (`systemctl --user`), não de sistema. Ele precisa da mesma conta que usa o painel: a chave SSH e o `~/.ssh/config` com o alias `spark`, o `~/.cache/delegate-local/runs.jsonl`, os transcripts em `~/.claude/projects` e a skill `delegate-local`. Um serviço de sistema rodaria como outro usuário e perderia tudo isso.

A unidade é [icewall.service](icewall.service), versionada aqui e ligada ao systemd por symlink: editar o arquivo no repositório muda o serviço depois de um `daemon-reload`.

## O que a unidade faz

| Diretiva | Por quê |
|---|---|
| `WorkingDirectory=%h/Projects/ICEWALL` | O `next start` lê o `.env.local` e o build (`.next/`) da pasta atual; o banco fica em `data/icewall.db`. |
| `Environment=PATH=…nvm…/v24.21.0/bin:…` | O Node vem do nvm, que não existe fora de um shell interativo. O PATH também serve aos processos filhos (`ssh`, `flock`, `ollama-delegate` em Python). |
| `ExecStart=… next start -H 127.0.0.1 -p 4310` | Só localhost: o painel executa ações no Spark e não tem login. |
| `Restart=on-failure`, `RestartSec=5` | Volta sozinho se o processo cair. Um `stop` manual não reinicia. |
| `KillMode=control-group`, `TimeoutStopSec=20` | Ao parar, mata o cgroup inteiro, inclusive o processo que segura o lock do delegate-local durante o benchmark de performance. No Fedora, quem passar de 20 s leva SIGABRT (drop-in `10-timeout-abort.conf` do sistema). |
| `WantedBy=default.target` | Sobe com o gerenciador do usuário. Com *linger* ativo (`loginctl show-user $USER -p Linger` → `yes`), isso acontece no boot, sem precisar fazer login. |

Não há dependência de rede: `network-online.target` não existe no systemd de usuário. Os coletores aguentam o Spark fora do ar: cada um grava o erro, mantém na tela o último dado bom e tenta de novo no próximo ciclo.

## Instalar

```bash
cd ~/Projects/ICEWALL
npm install && npm run build                     # o serviço serve o build, não o código-fonte
systemctl --user link "$PWD/deploy/icewall.service"
systemctl --user enable --now icewall
loginctl enable-linger "$USER"                   # opcional: subir no boot sem login (aqui já está ativo)
```

Confira em http://127.0.0.1:4310 ou com `systemctl --user status icewall`.

## Operar

| Tarefa | Comando |
|---|---|
| Estado | `systemctl --user status icewall` |
| Logs ao vivo | `journalctl --user -u icewall -f` |
| Logs desde o boot | `journalctl --user -u icewall -b` |
| Parar / iniciar | `systemctl --user stop icewall` / `systemctl --user start icewall` |
| Aplicar mudança de código | `npm run build && systemctl --user restart icewall` |
| Aplicar mudança na unidade | `systemctl --user daemon-reload && systemctl --user restart icewall` |
| Mudou o `.env.local` | `systemctl --user restart icewall` (o Next lê o arquivo só ao subir) |

**Sempre faça o build antes do restart.** O serviço serve o `.next/` que existir:
- Sem build novo, ele sobe com o código antigo.
- Sem `.next/`, o `next start` falha, e o `Restart=on-failure` tenta de novo a cada 5 s até haver build.

O agendador de coletas sobe uma vez por processo e não recebe hot-reload, então qualquer mudança no servidor pede restart.

## Desenvolvimento

O `npm run dev` usa a mesma porta (4310). Pare o serviço antes e suba de novo depois:

```bash
systemctl --user stop icewall
npm run dev
# … Ctrl+C
npm run build && systemctl --user start icewall
```

## Trocar a versão do Node

O caminho do nvm (`v24.21.0`) aparece duas vezes na unidade, em `Environment=PATH` e em `ExecStart`. Depois de `nvm install` de outra versão:

```bash
sed -i 's#/node/v24.21.0/#/node/vNOVA/#g' deploy/icewall.service
rm -rf node_modules && npm install && npm run build   # o better-sqlite3 é nativo e precisa compilar para o Node novo
systemctl --user daemon-reload && systemctl --user restart icewall
```

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `EADDRINUSE` no log, reinício a cada 5 s | Outro processo na 4310, em geral um `npm run dev` ou `npm start` esquecido: `ss -tlnp \| grep 4310`. |
| Spark "inalcançável" no painel e `Permission denied` no log | A chave SSH ou o alias `spark` mudou. Teste no terminal: `ssh -o BatchMode=yes spark true`. |
| Auditor diz que a Jev está desligada | Falta `TYPESAFE_API_KEY` no `.env.local`, ou o serviço não foi reiniciado depois de pôr a chave. |
| `NODE_MODULE_VERSION` no log | O Node mudou sem reinstalar o `better-sqlite3`: veja "Trocar a versão do Node". |
| O serviço não sobe no boot | Linger desligado: `loginctl enable-linger "$USER"`. |

## Remover

```bash
systemctl --user disable --now icewall
rm -f ~/.config/systemd/user/icewall.service   # o disable costuma já remover o link; o arquivo no repositório fica
systemctl --user daemon-reload
```
