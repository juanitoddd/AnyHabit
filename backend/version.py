"""Single source of truth for the application version.

The version is surfaced through ``GET /version`` and is used by the migration
runner to label the automatic backup it takes before touching an existing
database.
"""

APP_VERSION = "0.7.0"
APP_NAME = "AnyHabit"

# Bumped whenever a migration is added to ``migrations.MIGRATIONS``.  Stored in
# the database so a downgrade can be detected and reported instead of silently
# corrupting data.
SCHEMA_VERSION = 7
