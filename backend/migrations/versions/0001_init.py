"""Initial schema."""
from migrations.sqlfile import run_sql

revision = "0001"
down_revision = None


def upgrade() -> None:
    run_sql("0001_init.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
