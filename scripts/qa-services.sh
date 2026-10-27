#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_DIR="$BACKEND_DIR/.qa-data"
PGDATA="$QA_DIR/postgres"
PG_BIN="$(brew --prefix postgresql@18)/bin"
REDIS_BIN="$(brew --prefix redis)/bin"
PG_PORT=55433
REDIS_PORT=16380

check_tools() {
  for tool in "$PG_BIN/initdb" "$PG_BIN/pg_ctl" "$PG_BIN/pg_isready" "$PG_BIN/createdb" "$PG_BIN/psql" "$REDIS_BIN/redis-server" "$REDIS_BIN/redis-cli"; do
    if [[ ! -x "$tool" ]]; then
      echo "Required local QA service tool is missing: $tool" >&2
      exit 1
    fi
  done
}

start_services() {
  mkdir -p "$QA_DIR/redis"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    mkdir -p "$PGDATA"
    "$PG_BIN/initdb" -D "$PGDATA" -U soform_qa -A trust --no-locale --encoding=UTF8
  fi
  if ! "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
      echo "Port $PG_PORT is already serving PostgreSQL; refusing to use an unknown database." >&2
      exit 1
    fi
    "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$QA_DIR/postgres.log" -o "-h 127.0.0.1 -p $PG_PORT" start
  fi
  local existing_db
  existing_db="$("$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U soform_qa -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'soform_qa'")"
  if [[ "$existing_db" != "1" ]]; then
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U soform_qa soform_qa
  fi

  if "$REDIS_BIN/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    if [[ ! -f "$QA_DIR/redis.pid" ]]; then
      echo "Port $REDIS_PORT is already serving Redis; refusing to use an unknown service." >&2
      exit 1
    fi
    local redis_pid
    redis_pid="$(cat "$QA_DIR/redis.pid")"
    if ! ps -p "$redis_pid" -o args= | grep -Fq "redis-server 127.0.0.1:$REDIS_PORT"; then
      echo "Port $REDIS_PORT is serving an unexpected Redis process; refusing to use it." >&2
      exit 1
    fi
  else
    "$REDIS_BIN/redis-server" --bind 127.0.0.1 --protected-mode yes --port "$REDIS_PORT" --daemonize yes --pidfile "$QA_DIR/redis.pid" --logfile "$QA_DIR/redis.log" --dir "$QA_DIR/redis" --save "" --appendonly no
  fi
  echo "Local QA services are ready: Postgres :$PG_PORT (soform_qa), Redis :$REDIS_PORT."
}

stop_services() {
  if [[ -f "$QA_DIR/redis.pid" ]]; then
    local redis_pid
    redis_pid="$(cat "$QA_DIR/redis.pid")"
    if kill -0 "$redis_pid" 2>/dev/null; then
      if ps -p "$redis_pid" -o args= | grep -Fq "redis-server 127.0.0.1:$REDIS_PORT"; then
        "$REDIS_BIN/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" shutdown
      else
        echo "Refusing to stop Redis PID $redis_pid because it is not the QA service." >&2
        exit 1
      fi
    else
      rm -f "$QA_DIR/redis.pid"
    fi
  fi
  if [[ -f "$PGDATA/PG_VERSION" ]] && "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop
  fi
  echo "Local QA services stopped; their disposable data remains in .qa-data/."
}

check_tools
case "${1:-}" in
  start) start_services ;;
  stop) stop_services ;;
  status)
    "$PG_BIN/pg_ctl" -D "$PGDATA" status || true
    "$REDIS_BIN/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" ping || true
    ;;
  *)
    echo "Usage: $0 start|stop|status"
    exit 2
    ;;
esac
