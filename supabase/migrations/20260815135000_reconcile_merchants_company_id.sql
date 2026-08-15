-- Reconcile the canonical company -> merchant tenant relationship without
-- removing or renaming the legacy organisations model.

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$
DECLARE
  has_legacy_merchant_organisation_id BOOLEAN;
  has_legacy_company_organisation_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchants'
      AND column_name = 'organisation_id'
  )
  INTO has_legacy_merchant_organisation_id;

  IF has_legacy_merchant_organisation_id THEN
    EXECUTE $sql$
      UPDATE public.merchants m
      SET company_id = c.id
      FROM public.companies c
      WHERE m.company_id IS NULL
        AND m.organisation_id IS NOT NULL
        AND c.id = m.organisation_id
    $sql$;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'companies'
        AND column_name = 'organisation_id'
    )
    INTO has_legacy_company_organisation_id;

    IF has_legacy_company_organisation_id THEN
      EXECUTE $sql$
        WITH valid_legacy_mappings AS (
          SELECT m.id AS merchant_id, MIN(c.id) AS company_id
          FROM public.merchants m
          JOIN public.companies c
            ON c.organisation_id = m.organisation_id
          WHERE m.company_id IS NULL
            AND m.organisation_id IS NOT NULL
          GROUP BY m.id
          HAVING COUNT(DISTINCT c.id) = 1
        )
        UPDATE public.merchants m
        SET company_id = mapping.company_id
        FROM valid_legacy_mappings mapping
        WHERE m.id = mapping.merchant_id
          AND m.company_id IS NULL
      $sql$;
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  unmappable_count BIGINT;
  orphaned_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO unmappable_count
  FROM public.merchants
  WHERE company_id IS NULL;

  IF unmappable_count > 0 THEN
    RAISE EXCEPTION
      'Cannot reconcile public.merchants.company_id: % merchant row(s) have no unique valid company mapping',
      unmappable_count;
  END IF;

  SELECT COUNT(*)
  INTO orphaned_count
  FROM public.merchants m
  LEFT JOIN public.companies c ON c.id = m.company_id
  WHERE c.id IS NULL;

  IF orphaned_count > 0 THEN
    RAISE EXCEPTION
      'Cannot reconcile public.merchants.company_id: % merchant row(s) reference a missing company',
      orphaned_count;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_attribute column_record
      ON column_record.attrelid = constraint_record.conrelid
      AND column_record.attnum = ANY (constraint_record.conkey)
    WHERE constraint_record.conrelid = 'public.merchants'::regclass
      AND constraint_record.contype = 'f'
      AND constraint_record.confrelid = 'public.companies'::regclass
      AND column_record.attname = 'company_id'
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT merchants_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
DECLARE
  company_fk_name TEXT;
BEGIN
  FOR company_fk_name IN
    SELECT DISTINCT constraint_record.conname
    FROM pg_constraint constraint_record
    JOIN pg_attribute column_record
      ON column_record.attrelid = constraint_record.conrelid
      AND column_record.attnum = ANY (constraint_record.conkey)
    WHERE constraint_record.conrelid = 'public.merchants'::regclass
      AND constraint_record.contype = 'f'
      AND constraint_record.confrelid = 'public.companies'::regclass
      AND column_record.attname = 'company_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.merchants VALIDATE CONSTRAINT %I',
      company_fk_name
    );
  END LOOP;
END
$$;

ALTER TABLE public.merchants
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_company_id
  ON public.merchants (company_id);

NOTIFY pgrst, 'reload schema';