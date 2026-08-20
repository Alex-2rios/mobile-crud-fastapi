.DEFAULT_GOAL := help
.PHONY: help install test lint migrate api up down logs mobile clean

help:
	@echo "install  install the backend dependencies"
	@echo "test     run the backend test suite"
	@echo "lint     run ruff over the backend"
	@echo "migrate  apply the database migrations"
	@echo "api      run the api locally against sqlite"
	@echo "up       run the api and postgres in containers"
	@echo "down     stop the containers"
	@echo "logs     follow the container logs"
	@echo "mobile   start the expo client"
	@echo "clean    remove caches and the local sqlite database"

install:
	cd backend && pip install -r requirements-dev.txt

test:
	cd backend && pytest

lint:
	cd backend && ruff check .

migrate:
	cd backend && alembic upgrade head

api:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

mobile:
	cd mobile && npm start

clean:
	docker compose down -v
	rm -f backend/inventory.db
	find . -name __pycache__ -type d -exec rm -rf {} +
