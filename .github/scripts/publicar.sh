#!/usr/bin/env bash
# Guarda os dados do robô e publica no main (robô diário e Kings League).
#
# Uso: bash .github/scripts/publicar.sh "mensagem do commit" arquivo1.json arquivo2.json ...
#
# O robô diário leva uns 25 minutos. Se alguém publicar código no meio (aconteceu em 21/11/2026), o main
# anda e o push do robô é recusado. Aí este script pega o main novo, põe os dados do robô por cima, gera a
# pasta docs de novo (o sw.js e o versao.txt mudam a cada geração, por isso não dá para só "rebasear") e
# tenta outra vez. Um arquivo de dados que o main novo também mudou fica como está no main: os dois teriam
# mexido no mesmo arquivo, e a próxima rodada do robô coleta de novo em cima dele.
set -euo pipefail

mensagem="$1"
shift
arquivos=("$@")

if git diff --quiet -- "${arquivos[@]}"; then
  echo "Nada novo."
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

base=$(git rev-parse HEAD) # o commit de onde o robô partiu
guardados=$(mktemp -d)
for f in "${arquivos[@]}"; do cp "$f" "$guardados/$(basename "$f")"; done

for tentativa in 1 2 3; do
  # a pasta www do APK é ignorada pelo git de propósito (o workflow do APK copia docs/apk/)
  git add "${arquivos[@]}" docs
  git commit -q -m "$mensagem"
  if git push -q origin HEAD:main; then
    echo "Publicado (tentativa $tentativa)."
    # pede ao Pages para publicar de novo (um push feito pelo robô pode não disparar a publicação)
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      gh api -X POST "repos/${GITHUB_REPOSITORY}/pages/builds" >/dev/null || echo "aviso: não consegui pedir a publicação do Pages"
    fi
    exit 0
  fi

  echo "O main andou enquanto o robô rodava: refazendo em cima da versão nova (tentativa $tentativa)."
  git fetch -q origin main
  git reset -q --hard origin/main
  for f in "${arquivos[@]}"; do
    if git diff --quiet "$base" origin/main -- "$f"; then
      cp "$guardados/$(basename "$f")" "$f"
    else
      echo "aviso: o main também mudou $f; fica a versão do main e o robô coleta de novo na próxima rodada"
    fi
  done
  base=$(git rev-parse HEAD)
  if git diff --quiet -- "${arquivos[@]}"; then
    echo "O main já tem estes dados. Nada a publicar."
    exit 0
  fi
  python gerar_celular.py
done

echo "Não consegui publicar depois de 3 tentativas." >&2
exit 1
