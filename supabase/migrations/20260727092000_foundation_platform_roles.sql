-- Sprint 1 "Foundation it": platform-level roles.
--
-- Platform-level access (nexus_super_admin, nexus_support) is deliberately
-- NOT a new table - it reuses the existing roles/permissions/user_roles
-- infrastructure from 20260627213000_manage_it_permissions.sql, which already
-- provides has_permission(), get_my_access_profile() and RLS-safe checks.
-- Adding a parallel "platform_memberships" table would duplicate that system
-- for no benefit, so this migration only adds the new role/permission rows
-- and a small is_platform_admin() convenience wrapper.

INSERT INTO public.roles (slug, name, description)
VALUES
  ('nexus_super_admin', 'Nexus Super Admin', 'Full platform-wide access across every organisation and merchant.'),
  ('nexus_support', 'Nexus Support', 'Platform support staff with broad read-only access for troubleshooting.')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (slug, description, category)
VALUES
  ('platform:super_admin', 'Full platform administrative access across all tenants.', 'platform'),
  ('platform:support_access', 'Read-only platform support access across tenants.', 'platform')
ON CONFLICT (slug) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category;

-- nexus_super_admin gets every existing permission plus the new platform ones.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug = 'nexus_super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Legacy super_admin role also gets platform:super_admin for continuity with
-- existing bootstrap admins during the transition.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.slug = 'super_admin' AND p.slug = 'platform:super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- nexus_support gets read-only visibility across the platform.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.slug = 'nexus_support'
  AND p.slug IN (
    'platform:support_access',
    'manage:companies:view',
    'manage:customers:view',
    'manage:documents:view',
    'manage:integrations:view',
    'manage:subscriptions:view',
    'manage:platform:audit_log',
    'view:operations'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Backfill: anyone currently holding the legacy 'super_admin' role also gets
-- 'nexus_super_admin' so existing bootstrap admins keep working unchanged.
INSERT INTO public.user_roles (user_id, role_id)
SELECT ur.user_id, r2.id
FROM public.user_roles ur
JOIN public.roles r1 ON r1.id = ur.role_id AND r1.slug = 'super_admin'
JOIN public.roles r2 ON r2.slug = 'nexus_super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_admin(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission(target_user_id, 'platform:super_admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID) TO authenticated;

-- Widen the signup trigger (defined in manage_it_permissions.sql) so bootstrap
-- admin emails additionally receive nexus_super_admin going forward. This is
-- additive: the existing 'super_admin' / 'user' assignment behaviour for
-- everyone else is unchanged.
CREATE OR REPLACE FUNCTION public.assign_default_role_to_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_bootstrap_admin BOOLEAN;
  resolved_role_id UUID;
  platform_role_id UUID;
BEGIN
  is_bootstrap_admin := EXISTS (
    SELECT 1
    FROM public.platform_admin_bootstrap bootstrap
    WHERE bootstrap.email ILIKE NEW.email
  );

  SELECT id INTO resolved_role_id
  FROM public.roles
  WHERE slug = CASE WHEN is_bootstrap_admin THEN 'super_admin' ELSE 'user' END
  LIMIT 1;

  IF resolved_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, resolved_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  IF is_bootstrap_admin THEN
    SELECT id INTO platform_role_id FROM public.roles WHERE slug = 'nexus_super_admin' LIMIT 1;
    IF platform_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, platform_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
