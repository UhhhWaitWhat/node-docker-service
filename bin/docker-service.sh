#!/bin/bash
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

if ! node --v8-options | grep harmony_generators 2>&1 >/dev/null; then
  >&2 echo "ERROR! unsupported version of node detected."
  exit 1;
fi

node --harmony $DIR/docker-service.js "$@"
