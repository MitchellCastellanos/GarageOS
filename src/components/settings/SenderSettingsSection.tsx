"use client";

import { useState } from "react";
import type { CommunicationSettingsData } from "@/actions/communications-settings";
import { SenderIdentitiesCard } from "./SenderIdentitiesCard";
import { SenderRoutesCard } from "./SenderRoutesCard";

interface SenderSettingsSectionProps {
  data: CommunicationSettingsData;
  canCreateIdentity: boolean;
}

export function SenderSettingsSection({ data, canCreateIdentity }: SenderSettingsSectionProps) {
  const [identities, setIdentities] = useState(data.identities);
  const [routes, setRoutes] = useState(data.routes);

  return (
    <>
      <SenderIdentitiesCard
        identities={identities}
        domainOptions={data.domainOptions}
        canCreateIdentity={canCreateIdentity}
        onIdentityCreated={(identity) => setIdentities((prev) => [...prev, identity])}
      />
      <SenderRoutesCard
        identities={identities}
        routes={routes}
        purposes={data.purposes}
        onRouteChange={(purpose, channel, senderIdentityId) =>
          setRoutes((prev) => {
            const rest = prev.filter((r) => !(r.purpose === purpose && r.channel === channel));
            return [...rest, { purpose, channel, senderIdentityId }];
          })
        }
      />
    </>
  );
}
