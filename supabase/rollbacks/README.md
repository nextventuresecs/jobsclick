# AUTH-01 manual rollback scripts

These reviewed-draft scripts are siblings of the forward migrations, outside the auto-replayed migrations directory. Run only against a verified disposable target for tests; human review is required before any hosted recovery. Never copy them into migrations as .down.sql: the CLI would treat those as forward migrations. Populated M2 mappings and incompatible M1 state deliberately refuse destructive rollback. Audit evidence is preserved.
