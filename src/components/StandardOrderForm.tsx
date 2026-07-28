"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createEmptyStandardOrder,
  type IntakeSourceSystem,
  type StandardGoodsItem,
  type StandardOrder,
} from "@/lib/intake/standardOrder";
import { fetchCurrentProfile, supabase } from "@/lib/supabaseClient";
import { resolveSalesChannel } from "@/lib/salesChannels";
import SalesChannelField from "@/components/SalesChannelField";
import type { CatalogueItem } from "@/lib/catalogue";
import {
  parseCollectionProfileName,
  profileToStop,
  type CollectionMode,
  type DefaultCollectionProfile,
} from "@/lib/defaultCollectionProfiles";
import { applyCustomerDefaults } from "@/lib/customerBookingDefaults";
import type { MerchantCustomer } from "@/lib/merchantCustomers";
import {
  DELIVERY_RELEASE_WORKING_DAYS,
  evaluateFutureDeliveryHold,
} from "@/lib/orderLifecycle";

type Props = {
  sourceSystem: IntakeSourceSystem;
  title: string;
  subtitle: string;
  bookingVariant?: "standard" | "deliver" | "return" | "request";
};

type SubmitState = "idle" | "submitting" | "success" | "error";
type SubmitIntent = "draft" | "process";

type BookingProfile = {
  id: string;
  profileName: string;
  customerId: string;
  collectionAddressId: string | null;
  deliveryAddressId: string | null;
  collectionSnapshot: Partial<StandardOrder["collection"]>;
  deliverySnapshot: Partial<StandardOrder["delivery"]>;
  serviceDefaults: {
    serviceType?: string;
    collectionMode?: CollectionMode;
  };
  goodsDefaults: Array<Partial<StandardGoodsItem>>;
  commercialDefaults: Partial<StandardOrder["commercial"]>;
  instructions: string;
  updatedAt: string;
};

type NewCustomerForm = {
  customerName: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  postcode: string;
  country: string;
  instructions: string;
};

type CustomerAddressType = "collection" | "delivery";

type CustomerAddress = {
  id: string;
  addressType: CustomerAddressType;
  label: string;
  contactName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  postcode: string;
  country: string;
  instructions: string;
  isDefault: boolean;
  archivedAt: string | null;
};

type MerchantWorkspace = {
  id: string;
  merchantName: string;
  tradingName?: string;
  contactName?: string;
  telephone?: string;
  contactEmail: string;
  status: string;
};

const MERCHANT_WORKSPACES_STORAGE_KEY = "nexus.manageit.merchantWorkspaces.v1";
const ACTIVE_WORKSPACE_STORAGE_KEY = "nexus.manageit.activeWorkspaceId.v1";

function loadStoredMerchantWorkspaces(): MerchantWorkspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MERCHANT_WORKSPACES_STORAGE_KEY) ?? "[]";
    const parsed = JSON.parse(raw) as MerchantWorkspace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadActiveWorkspaceId(workspaces: MerchantWorkspace[]): string {
  if (typeof window === "undefined") return "";
  const preferredId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)?.trim() ?? "";
  if (preferredId && workspaces.some((workspace) => workspace.id === preferredId)) {
    return preferredId;
  }
  return workspaces[0]?.id ?? "";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

const sectionClass =
  "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

function updateGoodsItem(items: StandardGoodsItem[], index: number, next: Partial<StandardGoodsItem>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function formatDateLabel(value: Date | null): string {
  if (!value) return "";
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function applyAddressToStop(
  stop: StandardOrder["collection"] | StandardOrder["delivery"],
  address: CustomerAddress
): StandardOrder["collection"] | StandardOrder["delivery"] {
  return {
    ...stop,
    contact: address.contactName || stop.contact,
    addressLine1: address.addressLine1 || stop.addressLine1,
    addressLine2: address.addressLine2 || stop.addressLine2,
    addressLine3: address.addressLine3 || stop.addressLine3,
    postcode: address.postcode || stop.postcode,
    country: address.country || stop.country,
    email: address.email || stop.email,
    phone: address.phone || stop.phone,
    instructions: address.instructions || stop.instructions,
  };
}

export default function StandardOrderForm({ sourceSystem, title, subtitle, bookingVariant = "standard" }: Props) {
  const [order, setOrder] = useState<StandardOrder>(() => createEmptyStandardOrder(sourceSystem));
  const [profileCompanyId, setProfileCompanyId] = useState("");
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("new_address");
  const [defaultCollectionProfile, setDefaultCollectionProfile] = useState<DefaultCollectionProfile | null>(null);
  const [collectionProfiles, setCollectionProfiles] = useState<DefaultCollectionProfile[]>([]);
  const [selectedCollectionProfileId, setSelectedCollectionProfileId] = useState("");
  const [salesChannelId, setSalesChannelId] = useState("");
  const [salesChannelName, setSalesChannelName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<MerchantCustomer[]>([]);
  const [customerOrderRefMap, setCustomerOrderRefMap] = useState<Record<string, string[]>>({});
  const [merchantWorkspaces, setMerchantWorkspaces] = useState<MerchantWorkspace[]>(() =>
  loadStoredMerchantWorkspaces()
  );
  const [selectedMerchantWorkspaceId, setSelectedMerchantWorkspaceId] = useState(() =>
    loadActiveWorkspaceId(loadStoredMerchantWorkspaces())
  );
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [selectedCollectionAddressId, setSelectedCollectionAddressId] = useState("");
  const [selectedDeliveryAddressId, setSelectedDeliveryAddressId] = useState("");
  const [trackPodReleaseDecision, setTrackPodReleaseDecision] = useState<"send_now" | "hold_for_date">("send_now");
  const [adminOverrideRelease, setAdminOverrideRelease] = useState(false);
  const [bookingProfiles, setBookingProfiles] = useState<BookingProfile[]>([]);
  const [catalogueItems, setCatalogueItems] = useState<CatalogueItem[]>([]);
  const [selectedBookingProfileId, setSelectedBookingProfileId] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerForm>({
    customerName: "",
    company: "",
    contactName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    addressLine3: "",
    postcode: "",
    country: "UK",
    instructions: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitIntent, setSubmitIntent] = useState<SubmitIntent>("process");
  const [autoSelectionApplied, setAutoSelectionApplied] = useState(false);
  const [deepLinkCustomerId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("customerId")?.trim() ?? "";
  });
  const [deepLinkProfileId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("profileId")?.trim() ?? "";
  });

const isMerchantView = sourceSystem === "merchant_portal";

 const effectiveCompanyId = isMerchantView
  ? (selectedMerchantWorkspaceId || profileCompanyId)
  : profileCompanyId;
  const isAdminUser = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("nexus.manageit.accessProfile.v1") ?? "";
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { roles?: string[] };
      const roles = Array.isArray(parsed.roles) ? parsed.roles : [];
      return roles.some((role) => ["admin", "owner", "operations_admin", "ops_admin", "platform_admin", "super_admin"].includes(normalizeText(String(role))));
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
  if (!isMerchantView || !isAdminUser || !supabase) return;

  let cancelled = false;

  async function loadMerchantWorkspacesFromApi() {
    try {
      const {
        data: { session },
      } = await supabase!.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch("/api/manage-it/merchants", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) return;

      const payload = await response.json();
      const rawMerchants = Array.isArray(payload) ? payload : payload?.merchants ?? [];

      const fetched: MerchantWorkspace[] = rawMerchants
        .map((merchant: any) => ({
          id: String(merchant.id ?? ""),
          merchantName: merchant.merchantName ?? merchant.merchant_name ?? "",
          tradingName: merchant.tradingName ?? merchant.trading_name ?? "",
          contactName: merchant.contactName ?? merchant.contact_name ?? "",
          telephone: merchant.telephone ?? "",
          contactEmail: merchant.contactEmail ?? merchant.contact_email ?? "",
          status: merchant.status ?? "active",
        }))
        .filter((merchant: MerchantWorkspace) => merchant.id && merchant.merchantName);

      if (cancelled || fetched.length === 0) return;

      setMerchantWorkspaces(fetched);

      try {
        window.localStorage.setItem(
          "nexus.manageit.merchantWorkspaces.v1",
          JSON.stringify(fetched)
        );
      } catch {
        // cache only
      }

      setSelectedMerchantWorkspaceId((prev) => {
        if (prev && fetched.some((merchant) => merchant.id === prev)) {
          return prev;
        }
        return fetched[0]?.id ?? "";
      });
    } catch {
      // keep existing cached merchant list if API fetch fails
    }
  }

  void loadMerchantWorkspacesFromApi();

  return () => {
    cancelled = true;
  };
}, [isMerchantView, isAdminUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      if (!isMerchantView || !supabase) return;

      const {
        data: { session },
      } = await supabase!.auth.getSession();

      if (!session?.access_token) return;

      const customerParams = new URLSearchParams();
      if (selectedMerchantWorkspaceId) {
        customerParams.set("companyId", selectedMerchantWorkspaceId);
      }

      const response = await fetch(`/api/merchant/customers${customerParams.toString() ? `?${customerParams.toString()}` : ""}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) return;

      const payload = (await response.json().catch(() => ({}))) as {
        customers?: MerchantCustomer[];
      };

      if (!cancelled) {
        setCustomers(payload.customers ?? []);
      }

      if (!selectedMerchantWorkspaceId) return;
      const ordersResponse = await fetch(
        `/api/orders/dashboard?scope=admin&companyId=${encodeURIComponent(selectedMerchantWorkspaceId)}&limit=500`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!ordersResponse.ok || cancelled) return;
      const ordersPayload = (await ordersResponse.json().catch(() => ({}))) as {
        jobs?: Array<{
          customerMerchant?: string;
          internalOrderNumber?: string;
          externalOrderReference?: string;
        }>;
      };
      const nextMap: Record<string, string[]> = {};
      for (const job of ordersPayload.jobs ?? []) {
        const key = normalizeText(job.customerMerchant ?? "");
        if (!key) continue;
        const refs = [job.internalOrderNumber ?? "", job.externalOrderReference ?? ""].map((value) => value.trim()).filter(Boolean);
        if (!refs.length) continue;
        const bucket = new Set(nextMap[key] ?? []);
        for (const ref of refs) bucket.add(ref);
        nextMap[key] = Array.from(bucket);
      }
      if (!cancelled) {
        setCustomerOrderRefMap(nextMap);
      }
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [isMerchantView, selectedMerchantWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerAddresses() {
      if (!isMerchantView || !customerId || !supabase) {
        if (!cancelled) {
          setCustomerAddresses([]);
          setSelectedCollectionAddressId("");
          setSelectedDeliveryAddressId("");
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const params = new URLSearchParams();
      if (selectedMerchantWorkspaceId) {
        params.set("companyId", selectedMerchantWorkspaceId);
      }

      const response = await fetch(
        `/api/merchant/customers/${encodeURIComponent(customerId)}/addresses${params.toString() ? `?${params.toString()}` : ""}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (!response.ok) return;

      const payload = (await response.json().catch(() => ({}))) as {
        addresses?: CustomerAddress[];
      };

      if (cancelled) return;

      const addresses = payload.addresses ?? [];
      setCustomerAddresses(addresses);

      const defaultCollection = addresses.find(
        (address) => address.addressType === "collection" && address.isDefault
      );
      const defaultDelivery = addresses.find(
        (address) => address.addressType === "delivery" && address.isDefault
      );

      if (defaultCollection) {
        setSelectedCollectionAddressId(defaultCollection.id);
      }
      if (defaultDelivery) {
        setSelectedDeliveryAddressId(defaultDelivery.id);
      }

      setOrder((prev) => ({
        ...prev,
        collection: defaultCollection
          ? (applyAddressToStop(prev.collection, defaultCollection) as StandardOrder["collection"])
          : prev.collection,
        delivery: defaultDelivery
          ? (applyAddressToStop(prev.delivery, defaultDelivery) as StandardOrder["delivery"])
          : prev.delivery,
      }));
    }

    void loadCustomerAddresses();

    return () => {
      cancelled = true;
    };
  }, [customerId, isMerchantView, selectedMerchantWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogueItems() {
      if (!isMerchantView || !supabase) {
        if (!cancelled) {
          setCatalogueItems([]);
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (!cancelled) {
          setCatalogueItems([]);
        }
        return;
      }

      const response = await fetch("/api/catalogue/items?item_type=product", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        if (!cancelled) {
          setCatalogueItems([]);
        }
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        items?: CatalogueItem[];
      };

      if (!cancelled) {
        setCatalogueItems(payload.items ?? []);
      }
    }

    void loadCatalogueItems();

    return () => {
      cancelled = true;
    };
  }, [isMerchantView]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerBookingProfiles() {
      if (!isMerchantView || !customerId || !supabase) {
        if (!cancelled) {
          setBookingProfiles([]);
          setSelectedBookingProfileId("");
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const params = new URLSearchParams({ archived: "false" });
      if (selectedMerchantWorkspaceId) {
        params.set("companyId", selectedMerchantWorkspaceId);
      }

      const response = await fetch(
        `/api/merchant/customers/${encodeURIComponent(customerId)}/booking-profiles?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (!response.ok) return;

      const payload = (await response.json().catch(() => ({}))) as {
        profiles?: BookingProfile[];
      };

      if (cancelled) return;
      setBookingProfiles(payload.profiles ?? []);
    }

    void loadCustomerBookingProfiles();

    return () => {
      cancelled = true;
    };
  }, [customerId, isMerchantView, selectedMerchantWorkspaceId]);

  useEffect(() => {
    if (autoSelectionApplied) return;

    const customerIdFromQuery = deepLinkCustomerId;
    const profileIdFromQuery = deepLinkProfileId;

    if (customerIdFromQuery && customers.some((customer) => customer.id === customerIdFromQuery)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerId(customerIdFromQuery);
      const selected = customers.find((customer) => customer.id === customerIdFromQuery);
      if (selected) {
        setOrder((prev) => applyCustomerDefaults(prev, selected));
      }
      setAutoSelectionApplied(true);
      return;
    }

    if (profileIdFromQuery) {
      const profile = bookingProfiles.find((entry) => entry.id === profileIdFromQuery);
      if (profile) {
        applyTemplate(profile);
        setAutoSelectionApplied(true);
      }
    }
  }, [autoSelectionApplied, customers, deepLinkCustomerId, deepLinkProfileId, bookingProfiles]);

  const customerDeliveryAddresses = useMemo(
    () => customerAddresses.filter((address) => address.addressType === "delivery" && !address.archivedAt),
    [customerAddresses]
  );

  const selectedWorkspaceName = useMemo(() => {
    const selected = merchantWorkspaces.find((workspace) => workspace.id === selectedMerchantWorkspaceId);
    return selected?.merchantName ?? "";
  }, [merchantWorkspaces, selectedMerchantWorkspaceId]);

  useEffect(() => {
    if (!isMerchantView) return;
    if (!selectedWorkspaceName) return;
    setOrder((prev) => ({ ...prev, merchant: selectedWorkspaceName }));
  }, [isMerchantView, selectedWorkspaceName]);

  useEffect(() => {
    if (!isMerchantView) return;
    if (isAdminUser) return;
    if (!profileCompanyId) return;
    if (selectedMerchantWorkspaceId === profileCompanyId) return;
    setSelectedMerchantWorkspaceId(profileCompanyId);
  }, [isAdminUser, isMerchantView, profileCompanyId, selectedMerchantWorkspaceId]);

  const workspaceScopedCustomers = useMemo(() => {
    const needle = selectedWorkspaceName.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => customer.company.trim().toLowerCase() === needle);
  }, [customers, selectedWorkspaceName]);

  const filteredMerchantWorkspaces = useMemo(() => {
    const needle = normalizeText(merchantSearch);
    if (!needle) return merchantWorkspaces;
    return merchantWorkspaces.filter((workspace) => {
      return [
        workspace.merchantName,
        workspace.tradingName ?? "",
        workspace.contactName ?? "",
        workspace.contactEmail,
        workspace.telephone ?? "",
      ].some((value) => normalizeText(value).includes(needle));
    });
  }, [merchantSearch, merchantWorkspaces]);

  const filteredCustomers = useMemo(() => {
    const needle = normalizeText(customerSearch);
    if (!needle) return workspaceScopedCustomers;
    return workspaceScopedCustomers.filter((customer) => {
      const refs = customerOrderRefMap[normalizeText(customer.customerName)] ?? [];
      return [
        customer.customerName,
        customer.company,
        customer.contactName,
        customer.email,
        customer.phone,
        customer.mobile,
        customer.defaultDeliveryAddress,
        customer.defaultCollectionAddress,
        customer.billingAddress,
        customer.deliveryInstructions,
        refs.join(" "),
      ].some((value) => normalizeText(value).includes(needle));
    });
  }, [customerOrderRefMap, customerSearch, workspaceScopedCustomers]);

  const merchantCollectionAddresses = useMemo(
    () => {
      if (!selectedWorkspaceName.trim()) return [];
      const workspaceNeedle = selectedWorkspaceName.trim().toLowerCase();
      return collectionProfiles.filter((profile) => {
        const parsed = parseCollectionProfileName(profile.profileName);
        const scopedWorkspace = parsed.workspaceName.trim().toLowerCase();
        if (scopedWorkspace) {
          return scopedWorkspace === workspaceNeedle;
        }
        return profile.companyName.trim().toLowerCase() === workspaceNeedle;
      });
    },
    [collectionProfiles, selectedWorkspaceName]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultCollectionProfile() {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const params = new URLSearchParams();
      if (selectedMerchantWorkspaceId) {
        params.set("companyId", selectedMerchantWorkspaceId);
      }

      const response = await fetch(`/api/reference/default-collection-profile${params.toString() ? `?${params.toString()}` : ""}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as {
        profile?: DefaultCollectionProfile | null;
        profiles?: DefaultCollectionProfile[];
        suggestedDepotMode?: boolean;
      };

      if (cancelled) return;

      if (payload.profile) {
        const profiles = payload.profiles ?? [payload.profile];
        const preferredProfile = profiles.find((profile) => profile.isDefault) ?? payload.profile;
        setCollectionProfiles(profiles);
        setDefaultCollectionProfile(preferredProfile);
        setSelectedCollectionProfileId(preferredProfile.id);
        if (payload.suggestedDepotMode) {
          setCollectionMode("depot");
          setOrder((prev) => ({
            ...prev,
            collectionMode: "depot",
            collection: {
              ...prev.collection,
              ...profileToStop(preferredProfile),
            },
          }));
        }
        if (bookingVariant === "return") {
          setOrder((prev) => ({
            ...prev,
            delivery: {
              ...prev.delivery,
              ...profileToStop(preferredProfile),
            },
          }));
        }
      }
    }

    void loadDefaultCollectionProfile();

    return () => {
      cancelled = true;
    };
  }, [bookingVariant, selectedMerchantWorkspaceId]);

  const activeCollectionProfile =
    collectionProfiles.find((profile) => profile.id === selectedCollectionProfileId) ??
    defaultCollectionProfile;

  const canSubmit = useMemo(() => {
    const hasCollection =
      (collectionMode === "depot")
        ? Boolean(
            activeCollectionProfile?.addressLine1.trim() &&
            activeCollectionProfile?.postcode.trim()
          )
        : order.collection.addressLine1.trim().length > 0;

    const hasDelivery =
      bookingVariant === "return"
        ? Boolean(
            activeCollectionProfile?.addressLine1.trim() &&
            activeCollectionProfile?.postcode.trim()
          )
        : order.delivery.addressLine1.trim().length > 0;

    return (
      hasCollection &&
      hasDelivery &&
      order.goods.some((item) => item.description.trim().length > 0)
    );
  }, [activeCollectionProfile, bookingVariant, collectionMode, order]);

  const resolvedCollection =
    (collectionMode === "depot") && activeCollectionProfile
      ? {
          ...order.collection,
          ...profileToStop(activeCollectionProfile),
        }
      : order.collection;

  const resolvedDelivery =
    bookingVariant === "return" && activeCollectionProfile
      ? {
          ...order.delivery,
          ...profileToStop(activeCollectionProfile),
        }
      : order.delivery;

  const holdEvaluation = useMemo(
    () => evaluateFutureDeliveryHold(resolvedDelivery.date),
    [resolvedDelivery.date]
  );
  const hasFutureDateWarning = holdEvaluation.shouldHoldDelivery;
  const holdReleaseDate = holdEvaluation.autoReleaseDate;

  const getAuthHeaders = async () => {
    if (!supabase) {
      return {} as Record<string, string>;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {} as Record<string, string>;
    }

    return { Authorization: `Bearer ${session.access_token}` };
  };

  const loadBookingProfiles = async (targetCustomerId: string) => {
    if (!targetCustomerId || !supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const params = new URLSearchParams({ archived: "false" });
    if (selectedMerchantWorkspaceId) {
      params.set("companyId", selectedMerchantWorkspaceId);
    }
    const response = await fetch(
      `/api/merchant/customers/${encodeURIComponent(targetCustomerId)}/booking-profiles?${params.toString()}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!response.ok) return;
    const payload = (await response.json().catch(() => ({}))) as { profiles?: BookingProfile[] };
    setBookingProfiles(payload.profiles ?? []);
  };

  function applyTemplate(template: BookingProfile) {
    setCustomerId(template.customerId);
    setSelectedBookingProfileId(template.id);
    if (template.serviceDefaults.collectionMode === "depot" || template.serviceDefaults.collectionMode === "new_address") {
      setCollectionMode(template.serviceDefaults.collectionMode);
    }
    const defaults = template.goodsDefaults[0] ?? {};
    setOrder((prev) => ({
      ...prev,
      notes: template.instructions || prev.notes,
      collectionMode:
        template.serviceDefaults.collectionMode === "depot" || template.serviceDefaults.collectionMode === "new_address"
          ? template.serviceDefaults.collectionMode
          : prev.collectionMode,
      collection: { ...prev.collection, ...template.collectionSnapshot },
      delivery: { ...prev.delivery, ...template.deliverySnapshot },
      commercial: { ...prev.commercial, ...template.commercialDefaults },
      operations: {
        ...prev.operations,
        serviceType:
          typeof template.serviceDefaults.serviceType === "string"
            ? template.serviceDefaults.serviceType
            : prev.operations.serviceType,
      },
      goods: prev.goods.map((item, index) =>
        index === 0
          ? {
              ...item,
              fragile: Boolean(defaults.fragile),
              twoMan: Boolean(defaults.twoMan),
              roomOfChoice: Boolean(defaults.roomOfChoice),
              assembly: Boolean(defaults.assembly),
              tailLiftRequired: Boolean(defaults.tailLiftRequired),
              dedicatedVehicle: Boolean(defaults.dedicatedVehicle),
              northernIrelandDelivery: Boolean(defaults.northernIrelandDelivery),
              sameDay: Boolean(defaults.sameDay),
            }
          : item
      ),
    }));

    if (template.collectionAddressId) {
      setSelectedCollectionAddressId(template.collectionAddressId);
    }
    if (template.deliveryAddressId) {
      setSelectedDeliveryAddressId(template.deliveryAddressId);
    }

    setSubmitState("success");
    setSubmitMessage(`Loaded saved defaults: ${template.profileName}. Enter order-specific fields and submit.`);
  }

  const createCustomerInline = async () => {
    if (!newCustomerForm.customerName.trim()) {
      setSubmitState("error");
      setSubmitMessage("Customer name is required.");
      return;
    }

    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      setSubmitState("error");
      setSubmitMessage("No active session found.");
      return;
    }

    setNewCustomerSaving(true);
    try {
      const response = await fetch("/api/merchant/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          customerName: newCustomerForm.customerName,
          company: selectedWorkspaceName || newCustomerForm.company,
          contactName: newCustomerForm.contactName,
          email: newCustomerForm.email,
          phone: newCustomerForm.phone,
          mobile: newCustomerForm.phone,
          companyId: selectedMerchantWorkspaceId || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        customer?: MerchantCustomer;
      };
      if (!response.ok || !payload.customer) {
        throw new Error(payload.error ?? "Could not create customer");
      }

      const nextCustomers = [payload.customer, ...customers.filter((entry) => entry.id !== payload.customer?.id)];
      setCustomers(nextCustomers);
      setCustomerId(payload.customer.id);
      setOrder((prev) => applyCustomerDefaults(prev, payload.customer as MerchantCustomer));

      if (newCustomerForm.addressLine1.trim() && newCustomerForm.postcode.trim()) {
        await fetch(
          `/api/merchant/customers/${encodeURIComponent(payload.customer.id)}/addresses${selectedMerchantWorkspaceId ? `?companyId=${encodeURIComponent(selectedMerchantWorkspaceId)}` : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              companyId: selectedMerchantWorkspaceId || undefined,
              merchant_customer_id: payload.customer.id,
              addressType: "delivery",
              label: "Default delivery",
              contactName: newCustomerForm.contactName,
              phone: newCustomerForm.phone,
              email: newCustomerForm.email,
              addressLine1: newCustomerForm.addressLine1,
              addressLine2: newCustomerForm.addressLine2,
              addressLine3: newCustomerForm.addressLine3,
              postcode: newCustomerForm.postcode,
              country: newCustomerForm.country || "UK",
              instructions: newCustomerForm.instructions,
              isDefault: true,
            }),
          }
        );
      }

      await loadBookingProfiles(payload.customer.id);
      setShowNewCustomerForm(false);
      setNewCustomerForm({
        customerName: "",
        company: "",
        contactName: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        addressLine3: "",
        postcode: "",
        country: "UK",
        instructions: "",
      });
      setSubmitState("success");
      setSubmitMessage(`Customer created: ${payload.customer.customerName}. Default delivery address saved and selected.`);
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error instanceof Error ? error.message : "Could not create customer");
    } finally {
      setNewCustomerSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent: SubmitIntent = submitter?.value === "draft" ? "draft" : "process";
    setSubmitIntent(intent);

    if (!canSubmit) {
      setSubmitState("error");
      setSubmitMessage("Complete collection and delivery addresses, and at least one goods description.");
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage("");

    let resolvedSalesChannelId = salesChannelId;
    let resolvedSalesChannelName = salesChannelName.trim();

    if (!effectiveCompanyId) {
      setSubmitState("error");
      setSubmitMessage("No merchant profile found. Sign in and complete onboarding to create a company profile.");
      return;
    }

    try {
      const authHeaders = await getAuthHeaders();

      if (resolvedSalesChannelName) {
        const resolved = await resolveSalesChannel({
          companyId: effectiveCompanyId,
          name: resolvedSalesChannelName,
          authHeaders,
        });
        if (resolved) {
          resolvedSalesChannelId = resolved.id;
          resolvedSalesChannelName = resolved.name;
          setSalesChannelId(resolved.id);
          setSalesChannelName(resolved.name);
        }
      }

      const response = await fetch("/api/intake/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          order: {
            ...order,
            collectionMode,
            collection: resolvedCollection,
            delivery: resolvedDelivery,
            salesChannel: resolvedSalesChannelName,
            operations: {
              ...order.operations,
              readyForTrackPod:
                intent === "process"
                  ? trackPodReleaseDecision === "send_now" &&
                    (!hasFutureDateWarning || adminOverrideRelease)
                  : false,
              adminReleaseOverride: adminOverrideRelease,
            },
          },
          company_id: effectiveCompanyId,
          customer_id: customerId || null,
          booking_profile_id: selectedBookingProfileId || null,
          booking_profile_name:
            bookingProfiles.find((profile) => profile.id === selectedBookingProfileId)?.profileName ?? null,
          sales_channel_id: resolvedSalesChannelId || null,
          sales_channel_name: resolvedSalesChannelName || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        jobReference?: string;
        lifecycleStatus?: string;
      };

      if (!response.ok || !payload.success) {
        setSubmitState("error");
        setSubmitMessage(payload.error ?? "Could not create order.");
        return;
      }

      const ref = payload.jobReference ?? "reference pending";
      const status = payload.lifecycleStatus === "READY_FOR_TRACKPOD"
        ? " — ready for Process it"
        : payload.lifecycleStatus === "HELD_FUTURE_DATE"
          ? " — HELD - FUTURE DATE"
          : " — saved as draft";
      const reminder = hasFutureDateWarning && trackPodReleaseDecision === "hold_for_date"
        ? ` Reminder scheduled for ${formatDateLabel(holdReleaseDate)} when the order is within ${DELIVERY_RELEASE_WORKING_DAYS} working days.`
        : "";
      setSubmitState("success");
      setSubmitMessage(
        `${intent === "draft" ? "Draft saved" : "Order submitted"}: ${ref}${status}.${reminder}`.trim()
      );
      const empty = createEmptyStandardOrder(sourceSystem);
      setOrder(
        (collectionMode === "depot") && activeCollectionProfile
          ? {
              ...empty,
              collectionMode: "depot",
              collection: {
                ...empty.collection,
                ...profileToStop(activeCollectionProfile),
              },
            }
          : bookingVariant === "return" && activeCollectionProfile
            ? {
                ...empty,
                delivery: {
                  ...empty.delivery,
                  ...profileToStop(activeCollectionProfile),
                },
              }
            : empty
      );
      setCustomerId("");
      setSalesChannelId("");
      setSalesChannelName("");
      setTrackPodReleaseDecision("send_now");
      setAdminOverrideRelease(false);
      setSubmitIntent("process");
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error instanceof Error ? error.message : "Network error. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nexus Intake</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Booking Mode</h2>
          <p className="mt-2 text-sm text-slate-600">
            {bookingVariant === "deliver"
              ? "Deliver it supports depot collection or a brand new collection address."
              : bookingVariant === "return"
                ? "Return it uses your saved depot profile for delivery."
                : bookingVariant === "request"
                  ? "Request it is fully manual for unusual jobs and exceptions."
                  : "Choose whether this booking collects from your saved depot profile or a one-off address."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setCollectionMode("depot");
                if (activeCollectionProfile) {
                  setOrder((prev) => ({
                    ...prev,
                    collectionMode: "depot",
                    collection: {
                      ...prev.collection,
                      ...profileToStop(activeCollectionProfile),
                    },
                  }));
                }
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                collectionMode === "depot"
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <p className="font-semibold">Book it from Depot</p>
              <p className="mt-1 text-xs opacity-80">
                Uses saved collection profile and ignores OCR/manual collection replacement.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setCollectionMode("new_address");
                setOrder((prev) => ({ ...prev, collectionMode: "new_address" }));
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                collectionMode === "new_address"
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <p className="font-semibold">Book it from New Address</p>
              <p className="mt-1 text-xs opacity-80">
                Enter collection details manually for supplier collections, returns, and one-offs.
              </p>
            </button>
          </div>

          {collectionMode === "depot" ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {activeCollectionProfile ? (
                <>
                  {collectionProfiles.length > 1 ? (
                    <>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="collectionProfileSelect">
                        Collection Profile
                      </label>
                      <select
                        id="collectionProfileSelect"
                        className="mb-3 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        value={selectedCollectionProfileId}
                        onChange={(event) => {
                          const nextProfileId = event.target.value;
                          setSelectedCollectionProfileId(nextProfileId);
                          const nextProfile = collectionProfiles.find((profile) => profile.id === nextProfileId);
                          if (!nextProfile) return;
                          setOrder((prev) => ({
                            ...prev,
                            collection: {
                              ...prev.collection,
                              ...profileToStop(nextProfile),
                            },
                            delivery:
                              bookingVariant === "return"
                                ? {
                                    ...prev.delivery,
                                    ...profileToStop(nextProfile),
                                  }
                                : prev.delivery,
                          }));
                        }}
                      >
                        {collectionProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.profileName || "Collection profile"}
                            {profile.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <p className="font-semibold text-slate-900">Saved depot profile</p>
                  <p className="mt-1">{activeCollectionProfile.companyName || "-"}</p>
                  <p>{activeCollectionProfile.addressLine1 || "-"}</p>
                  <p>
                    {[activeCollectionProfile.addressLine2, activeCollectionProfile.addressLine3, activeCollectionProfile.postcode]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-red-700">No default collection profile saved</p>
                  <p className="mt-1 text-red-600">
                    Save a default depot in Account It before using Depot mode.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Order</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use saved merchant/customer/address defaults. Enter only order-specific details below.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isMerchantView ? (
              <div className="sm:col-span-2 lg:col-span-3">
                {merchantWorkspaces.length > 0 ? (
                  <div className="mb-3">
                    <label className="text-sm font-medium text-slate-700" htmlFor="merchantWorkspaceSelect">
                      Select Merchant
                    </label>
                    {isAdminUser ? (
                      <input
                        className={inputClass}
                        value={merchantSearch}
                        onChange={(event) => setMerchantSearch(event.target.value)}
                        placeholder="Search merchant, company, contact, email, or telephone"
                      />
                    ) : null}
                    <select
                      id="merchantWorkspaceSelect"
                      className={inputClass}
                      value={selectedMerchantWorkspaceId}
                      disabled={!isAdminUser}
                      onChange={(event) => {
                        const nextWorkspaceId = event.target.value;
                        setSelectedMerchantWorkspaceId(nextWorkspaceId);
                        if (typeof window !== "undefined") {
                          if (nextWorkspaceId) {
                            window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, nextWorkspaceId);
                          } else {
                            window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
                          }
                        }
                        const selectedWorkspace = merchantWorkspaces.find((workspace) => workspace.id === nextWorkspaceId);
                        const merchantName = selectedWorkspace?.merchantName ?? "";
                        setOrder((prev) => ({ ...prev, merchant: merchantName }));
                        setCustomerId("");
                        setSelectedCollectionAddressId("");
                        setSelectedDeliveryAddressId("");
                        setSelectedBookingProfileId("");
                      }}
                    >
                      <option value="">Select merchant...</option>
                      {(isAdminUser ? filteredMerchantWorkspaces : merchantWorkspaces).map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.merchantName}
                        </option>
                      ))}
                    </select>
                    {selectedMerchantWorkspaceId ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        {(() => {
                          const selectedWorkspace = merchantWorkspaces.find((workspace) => workspace.id === selectedMerchantWorkspaceId);
                          if (!selectedWorkspace) return <p>No merchant selected.</p>;
                          return (
                            <>
                              <p className="font-semibold text-slate-900">{selectedWorkspace.merchantName}</p>
                              <p>Company: {selectedWorkspace.tradingName || "-"}</p>
                              <p>Contact: {selectedWorkspace.contactName || "-"}</p>
                              <p>Email: {selectedWorkspace.contactEmail || "-"}</p>
                              <p>Telephone: {selectedWorkspace.telephone || "-"}</p>
                            </>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="customerSelect">Select Existing Customer</label>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm((prev) => !prev)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    + New Customer
                  </button>
                </div>
                <select
                  id="customerSelect"
                  className={inputClass}
                  value={customerId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setCustomerId(nextId);
                    setSelectedBookingProfileId("");
                    const selected = customers.find((customer) => customer.id === nextId);
                    if (!selected) return;
                    setOrder((prev) => applyCustomerDefaults(prev, selected));
                  }}
                >
                  <option value="">Select customer...</option>
                  {filteredCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customerName} {customer.company ? `(${customer.company})` : ""}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search customer, company, postcode, town, address, phone, email, order ref"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Selecting a customer loads saved delivery address, contact, phone, email, instructions, service defaults, and pricing defaults.
                </p>

                {showNewCustomerForm ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">New Customer</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Customer name" value={newCustomerForm.customerName} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, customerName: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Company" value={newCustomerForm.company} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, company: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Contact name" value={newCustomerForm.contactName} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Email" value={newCustomerForm.email} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, email: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" placeholder="Phone" value={newCustomerForm.phone} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, phone: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" placeholder="Default delivery address line 1" value={newCustomerForm.addressLine1} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine1: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Address line 2" value={newCustomerForm.addressLine2} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine2: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Address line 3 / town" value={newCustomerForm.addressLine3} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine3: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Postcode" value={newCustomerForm.postcode} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, postcode: event.target.value }))} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Country" value={newCustomerForm.country} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, country: event.target.value }))} />
                      <textarea className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" rows={2} placeholder="Delivery instructions" value={newCustomerForm.instructions} onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, instructions: event.target.value }))} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void createCustomerInline()} disabled={newCustomerSaving} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                        {newCustomerSaving ? "Creating..." : "Create Customer"}
                      </button>
                      <button type="button" onClick={() => setShowNewCustomerForm(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {customerId ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="bookingProfileSelect">
                        Service / Pricing Defaults
                      </label>
                      <select
                        id="bookingProfileSelect"
                        className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        value={selectedBookingProfileId}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          setSelectedBookingProfileId(nextId);
                          const selected = bookingProfiles.find((profile) => profile.id === nextId);
                          if (!selected) return;
                          applyTemplate(selected);
                        }}
                      >
                        <option value="">Load saved defaults...</option>
                        {bookingProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.profileName}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        Address/profile management belongs in Manage it / Customer Management.
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700" htmlFor="merchantCollectionAddressSelect">
                        Merchant Collection Address
                      </label>
                      <select
                        id="merchantCollectionAddressSelect"
                        className={inputClass}
                        value={selectedCollectionProfileId}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          setSelectedCollectionProfileId(nextId);
                          const selected = merchantCollectionAddresses.find((profile) => profile.id === nextId);
                          if (!selected) return;
                          setOrder((prev) => ({
                            ...prev,
                            collection: {
                              ...prev.collection,
                              ...profileToStop(selected),
                            },
                          }));
                        }}
                      >
                        <option value="">Select merchant collection address...</option>
                        {merchantCollectionAddresses.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.profileName}
                            {profile.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700" htmlFor="savedDeliveryAddressSelect">
                        Saved Delivery Address
                      </label>
                      <select
                        id="savedDeliveryAddressSelect"
                        className={inputClass}
                        value={selectedDeliveryAddressId}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          setSelectedDeliveryAddressId(nextId);
                          const selected = customerDeliveryAddresses.find((address) => address.id === nextId);
                          if (!selected) return;
                          setOrder((prev) => ({
                            ...prev,
                            delivery: applyAddressToStop(prev.delivery, selected) as StandardOrder["delivery"],
                          }));
                        }}
                      >
                        <option value="">Select saved delivery address...</option>
                        {customerDeliveryAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label || address.addressLine1}
                            {address.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="orderReference">Order Number</label>
              <input id="orderReference" className={inputClass} value={order.orderReference} onChange={(e) => setOrder((prev) => ({ ...prev, orderReference: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="jobReference">Job Reference</label>
              <input id="jobReference" className={inputClass} value={order.jobReference} onChange={(e) => setOrder((prev) => ({ ...prev, jobReference: e.target.value }))} placeholder="Operator job reference" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="externalOrderId">External ID</label>
              <input id="externalOrderId" className={inputClass} value={order.externalOrderId} onChange={(e) => setOrder((prev) => ({ ...prev, externalOrderId: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <SalesChannelField
                companyId={effectiveCompanyId}
                value={salesChannelName}
                selectedId={salesChannelId}
                onChange={({ id, name }) => {
                  setSalesChannelId(id);
                  setSalesChannelName(name);
                  setOrder((prev) => ({ ...prev, salesChannel: name }));
                }}
                helperText="Pick an existing source or create a new company-specific sales channel."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="merchant">Business / Organisation</label>
              <input id="merchant" className={inputClass} value={order.merchant} onChange={(e) => setOrder((prev) => ({ ...prev, merchant: e.target.value }))} placeholder="From selected merchant" disabled />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="customer">Contact Name</label>
              <input id="customer" className={inputClass} value={order.customer} onChange={(e) => setOrder((prev) => ({ ...prev, customer: e.target.value }))} placeholder="From selected customer" disabled />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="priority">Priority</label>
              <select id="priority" className={inputClass} value={order.priority} onChange={(e) => setOrder((prev) => ({ ...prev, priority: e.target.value as StandardOrder["priority"] }))}>
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="orderNotes">Notes</label>
              <textarea id="orderNotes" className={inputClass} rows={3} value={order.notes} onChange={(e) => setOrder((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Collection</h2>
          {collectionMode === "depot" ? (
            <p className="mt-2 text-sm text-slate-600">
              Collection details are locked to your default depot profile for this booking.
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="text-sm font-medium text-slate-700">Business / Organisation</label><input disabled className={inputClass} value={order.collection.company} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, company: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Contact Name</label><input disabled className={inputClass} value={order.collection.contact} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, contact: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Phone</label><input disabled className={inputClass} value={order.collection.phone} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, phone: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 1</label><input disabled className={inputClass} value={order.collection.addressLine1} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, addressLine1: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 2</label><input disabled className={inputClass} value={order.collection.addressLine2} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, addressLine2: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 3</label><input disabled className={inputClass} value={order.collection.addressLine3} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, addressLine3: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Postcode</label><input disabled className={inputClass} value={order.collection.postcode} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, postcode: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Country</label><input disabled className={inputClass} value={order.collection.country} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, country: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Email</label><input disabled className={inputClass} value={order.collection.email} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, email: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Collection Date</label><input type="date" className={inputClass} value={order.collection.date} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, date: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Collection Time</label><input type="time" className={inputClass} value={order.collection.time} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, time: e.target.value } }))} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="text-sm font-medium text-slate-700">Instructions</label><textarea className={inputClass} rows={2} value={order.collection.instructions} onChange={(e) => setOrder((prev) => ({ ...prev, collection: { ...prev.collection, instructions: e.target.value } }))} /></div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Delivery</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="text-sm font-medium text-slate-700">Business / Organisation</label><input disabled className={inputClass} value={order.delivery.company} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, company: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Contact Name</label><input disabled className={inputClass} value={order.delivery.contact} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, contact: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Phone</label><input disabled className={inputClass} value={order.delivery.phone} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, phone: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 1</label><input disabled className={inputClass} value={order.delivery.addressLine1} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, addressLine1: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 2</label><input disabled className={inputClass} value={order.delivery.addressLine2} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, addressLine2: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Address Line 3</label><input disabled className={inputClass} value={order.delivery.addressLine3} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, addressLine3: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Postcode</label><input disabled className={inputClass} value={order.delivery.postcode} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, postcode: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Country</label><input disabled className={inputClass} value={order.delivery.country} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, country: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Email</label><input disabled className={inputClass} value={order.delivery.email} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, email: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Delivery Date</label><input type="date" className={inputClass} value={order.delivery.date} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, date: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Delivery Time</label><input type="time" className={inputClass} value={order.delivery.time} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, time: e.target.value } }))} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="text-sm font-medium text-slate-700">Instructions</label><textarea className={inputClass} rows={2} value={order.delivery.instructions} onChange={(e) => setOrder((prev) => ({ ...prev, delivery: { ...prev.delivery, instructions: e.target.value } }))} /></div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Goods</h2>
            <button
              type="button"
              onClick={() =>
                setOrder((prev) => ({
                  ...prev,
                  goods: [
                    ...prev.goods,
                    {
                      description: "",
                        productCode: "",
                        catalogueItemId: "",
                        itemType: "product",
                        quantity: 1,
                        packages: 0,
                        palletCount: 0,
                        weightKg: 0,
                        dimensions: "",
                        unitPrice: 0,
                        vatRate: 0,
                        lineTotal: 0,
                      fragile: false,
                      twoMan: false,
                      roomOfChoice: false,
                      assembly: false,
                      photosRequired: false,
                        tailLiftRequired: false,
                        dedicatedVehicle: false,
                        northernIrelandDelivery: false,
                        sameDay: false,
                    },
                  ],
                }))
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Add Item
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {order.goods.map((item, index) => (
              <div key={`goods-${index}`} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="text-sm font-medium text-slate-700">Product</label>
                    <select
                      className={inputClass}
                      value={item.catalogueItemId ?? ""}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const selectedItem = catalogueItems.find((entry) => entry.id === nextId);
                        setOrder((prev) => ({
                          ...prev,
                          goods: updateGoodsItem(prev.goods, index, {
                            catalogueItemId: nextId,
                            description: selectedItem?.description || selectedItem?.name || prev.goods[index]?.description || "",
                            productCode: selectedItem?.sku ?? prev.goods[index]?.productCode ?? "",
                            unitPrice: selectedItem?.default_price ?? prev.goods[index]?.unitPrice ?? 0,
                            vatRate: selectedItem?.vat_rate ?? prev.goods[index]?.vatRate ?? 0,
                          }),
                        }));
                      }}
                    >
                      <option value="">Select product...</option>
                      {catalogueItems.map((catalogueItem) => (
                        <option key={catalogueItem.id} value={catalogueItem.id}>
                          {catalogueItem.name}
                          {catalogueItem.sku ? ` (${catalogueItem.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4"><label className="text-sm font-medium text-slate-700">Description</label><input className={inputClass} value={item.description} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { description: e.target.value }) }))} /></div>
                  <div><label className="text-sm font-medium text-slate-700">Quantity</label><input type="number" className={inputClass} value={item.quantity} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { quantity: Number.parseFloat(e.target.value) || 0 }) }))} /></div>
                  <div><label className="text-sm font-medium text-slate-700">Packages</label><input type="number" className={inputClass} value={item.packages} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { packages: Number.parseFloat(e.target.value) || 0 }) }))} /></div>
                  <div><label className="text-sm font-medium text-slate-700">Pallet Count</label><input type="number" className={inputClass} value={item.palletCount} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { palletCount: Number.parseFloat(e.target.value) || 0 }) }))} /></div>
                  <div><label className="text-sm font-medium text-slate-700">Weight (kg)</label><input type="number" className={inputClass} value={item.weightKg} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { weightKg: Number.parseFloat(e.target.value) || 0 }) }))} /></div>
                  <div className="sm:col-span-2 lg:col-span-4"><label className="text-sm font-medium text-slate-700">Dimensions</label><input className={inputClass} value={item.dimensions} onChange={(e) => setOrder((prev) => ({ ...prev, goods: updateGoodsItem(prev.goods, index, { dimensions: e.target.value }) }))} placeholder="e.g. 120 x 80 x 75 cm" /></div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["fragile", "Fragile"],
                    ["twoMan", "Two-man"],
                    ["roomOfChoice", "Room of choice"],
                    ["assembly", "Assembly"],
                    ["tailLiftRequired", "Tail-lift required"],
                    ["dedicatedVehicle", "Dedicated van"],
                    ["sameDay", "Same day"],
                  ].map(([key, label]) => (
                    <label key={`${index}-${key}`} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(item[key as keyof StandardGoodsItem])}
                        onChange={(e) =>
                          setOrder((prev) => ({
                            ...prev,
                            goods: updateGoodsItem(prev.goods, index, { [key]: e.target.checked }),
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Track-POD Release Check</h2>
          {hasFutureDateWarning ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                Delivery date is more than {DELIVERY_RELEASE_WORKING_DAYS} working days away. Delivery release is held.
              </p>
              <p className="mt-1">
                Planned release date: {formatDateLabel(holdReleaseDate)}. A release reminder should be scheduled and the order should auto-release once it is inside the allowed window.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No future-date hold detected. Collection can be released immediately, and delivery can be released after collection confirmation.
            </p>
          )}
          {!isMerchantView ? (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={adminOverrideRelease}
                onChange={(event) => setAdminOverrideRelease(event.target.checked)}
              />
              Admin override: allow delivery release despite hold checks.
            </label>
          ) : null}
          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="trackpod_release"
                  checked={trackPodReleaseDecision === "send_now"}
                  onChange={() => setTrackPodReleaseDecision("send_now")}
                  disabled={hasFutureDateWarning && !adminOverrideRelease}
                />
                <span>
                  <span className="font-semibold text-slate-900">Ready to send to Track-POD now</span>
                  <span className="mt-1 block text-xs text-slate-500">Use when date checks are complete and operations can proceed immediately.</span>
                </span>
              </span>
            </label>
            <label className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="trackpod_release"
                  checked={trackPodReleaseDecision === "hold_for_date"}
                  onChange={() => setTrackPodReleaseDecision("hold_for_date")}
                />
                <span>
                  <span className="font-semibold text-slate-900">Hold for date-related warning</span>
                  <span className="mt-1 block text-xs text-slate-500">Keeps the order in review until the planned release window.</span>
                </span>
              </span>
            </label>
          </fieldset>
          {hasFutureDateWarning && !adminOverrideRelease ? (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              Delivery release is locked until the auto-release window opens or an admin override is applied.
            </p>
          ) : null}
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-semibold text-slate-900">Commercial</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="text-sm font-medium text-slate-700">Purchase Order</label><input className={inputClass} value={order.commercial.purchaseOrder} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, purchaseOrder: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Net</label><input className={inputClass} value={order.commercial.net} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, net: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">VAT</label><input className={inputClass} value={order.commercial.vat} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, vat: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Total</label><input className={inputClass} value={order.commercial.total} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, total: e.target.value } }))} /></div>
            <div><label className="text-sm font-medium text-slate-700">Card Collection on Delivery</label><input className={inputClass} value={order.commercial.cod} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, cod: e.target.value } }))} /></div>
            <label className="flex items-center gap-2 self-end text-sm text-slate-700"><input type="checkbox" checked={order.commercial.invoiceRequired} onChange={(e) => setOrder((prev) => ({ ...prev, commercial: { ...prev.commercial, invoiceRequired: e.target.checked } }))} />Invoice required</label>
          </div>
        </section>

        {!isMerchantView ? (
          <section className={sectionClass}>
            <h2 className="text-base font-semibold text-slate-900">Operations</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><label className="text-sm font-medium text-slate-700">Depot</label><input className={inputClass} value={order.operations.depot} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, depot: e.target.value } }))} /></div>
              <div><label className="text-sm font-medium text-slate-700">Warehouse</label><input className={inputClass} value={order.operations.warehouse} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, warehouse: e.target.value } }))} /></div>
              <div><label className="text-sm font-medium text-slate-700">Route</label><input className={inputClass} value={order.operations.route} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, route: e.target.value } }))} /></div>
              <div><label className="text-sm font-medium text-slate-700">Shipper</label><input className={inputClass} value={order.operations.shipper} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, shipper: e.target.value } }))} /></div>
              <div><label className="text-sm font-medium text-slate-700">Service Type</label><input className={inputClass} value={order.operations.serviceType} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, serviceType: e.target.value } }))} /></div>
              <label className="flex items-center gap-2 self-end text-sm text-slate-700"><input type="checkbox" checked={order.operations.readyForTrackPod} onChange={(e) => setOrder((prev) => ({ ...prev, operations: { ...prev.operations, readyForTrackPod: e.target.checked } }))} />Ready for Track-POD</label>
            </div>
          </section>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              value="draft"
              disabled={submitState === "submitting"}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {submitState === "submitting" && submitIntent === "draft" ? "Saving Draft..." : "Save Draft"}
            </button>
            <button
              type="submit"
              value="process"
              disabled={submitState === "submitting"}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submitState === "submitting" && submitIntent === "process" ? "Submitting..." : "Submit to Process it"}
            </button>
          </div>

          {submitMessage && (
            <p className={`mt-3 text-sm ${submitState === "success" ? "text-emerald-700" : "text-red-700"}`}>
              {submitMessage}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
