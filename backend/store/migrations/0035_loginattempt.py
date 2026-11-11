from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('store', '0034_passwordresetotp'),
    ]

    operations = [
        migrations.CreateModel(
            name='LoginAttempt',
            fields=[
                ('identifier_hash', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('failed_attempts', models.PositiveSmallIntegerField(default=0)),
                ('locked_until', models.DateTimeField(blank=True, null=True)),
            ],
        ),
    ]
