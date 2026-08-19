from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.database import Base


def migrated_engine(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrated.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    return create_engine(url), config


def test_migration_creates_the_expected_tables(tmp_path):
    engine, _ = migrated_engine(tmp_path)
    tables = set(inspect(engine).get_table_names())

    assert {"users", "items", "alembic_version"} <= tables


def test_migration_matches_the_models(tmp_path):
    engine, _ = migrated_engine(tmp_path)

    with engine.connect() as connection:
        context = MigrationContext.configure(connection)
        differences = compare_metadata(context, Base.metadata)

    assert differences == [], f"the migration has drifted from the models: {differences}"


def test_migration_rolls_back_cleanly(tmp_path):
    engine, config = migrated_engine(tmp_path)
    command.downgrade(config, "base")

    tables = set(inspect(engine).get_table_names())

    assert "users" not in tables
    assert "items" not in tables


def test_unique_constraint_on_owner_and_sku_survives_the_migration(tmp_path):
    engine, _ = migrated_engine(tmp_path)
    constraints = inspect(engine).get_unique_constraints("items")

    assert any(c["column_names"] == ["owner_id", "sku"] for c in constraints)
