"use client";

import { getMyOrganization, syncCurrentUser } from "@/actions/dashboard";
import type { User } from "@/types/user";
import { useClerk, useOrganization } from "@clerk/nextjs";
import React, { useState, useContext, type ReactNode, useEffect } from "react";

interface ClientContextProps {
  client?: User;
}

export const ClientContext = React.createContext<ClientContextProps>({
  client: undefined,
});

interface ClientProviderProps {
  children: ReactNode;
}

export function ClientProvider({ children }: ClientProviderProps) {
  const [client, setClient] = useState<User>();
  const { user } = useClerk();
  const { organization } = useOrganization();

  const [clientLoading, setClientLoading] = useState(true);

  const fetchClient = async () => {
    try {
      setClientLoading(true);
      const response = await syncCurrentUser();
      setClient(response);
    } catch (error) {
      console.error(error);
    }
    setClientLoading(false);
  };

  const fetchOrganization = async () => {
    try {
      setClientLoading(true);
      const response = await getMyOrganization();
    } catch (error) {
      console.error(error);
    }
    setClientLoading(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (user?.id) {
      fetchClient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (organization?.id) {
      fetchOrganization();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  return (
    <ClientContext.Provider
      value={{
        client,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export const useClient = () => {
  const value = useContext(ClientContext);

  return value;
};
