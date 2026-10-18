from django.db import migrations


def repair_cake_message_length(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return

    cake = apps.get_model("store", "CakeCustomization")
    field = cake._meta.get_field("inscription_text")
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s AND column_name = %s
            """,
            [cake._meta.db_table, field.column],
        )
        column = cursor.fetchone()

    if column is None:
        raise RuntimeError("The cake inscription column is missing.")
    actual_length = column[0]
    if actual_length is None or actual_length >= field.max_length:
        return

    # Migration state already says 80, so a regular AlterField to 80 would
    # emit no SQL. Compare against the actual column to repair older databases.
    old_field = field.clone()
    old_field.set_attributes_from_name(field.name)
    old_field.model = cake
    old_field.max_length = actual_length
    schema_editor.alter_field(cake, old_field, field)


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0032_alter_customcakepricing_options_and_more"),
    ]

    operations = [
        # Keep the widened column on rollback to preserve messages over 30 chars.
        migrations.RunPython(repair_cake_message_length, migrations.RunPython.noop),
    ]
