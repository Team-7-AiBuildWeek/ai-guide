"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
"""
from migrations.sqlfile import run_sql

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}


def upgrade() -> None:
    run_sql("NNNN_name.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
