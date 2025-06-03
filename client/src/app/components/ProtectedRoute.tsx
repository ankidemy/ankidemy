"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    const token = localStorage.getItem("token");
    if (!token) {
      // Si no hay token en localStorage, redirigimos a /login
      router.push("/login");
    }
  }, [router]);

  if (!isClient) {
    return null;
  }

  // Si hay token renderizamos 
  return <>{children}</>;
}