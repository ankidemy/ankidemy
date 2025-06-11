// src/app/components/Landing/index.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/core/button";
import Image from "next/image";
import Link from "next/link";
import { checkAuthStatus } from "@/lib/api";

export default function Landing() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated on component mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const authStatus = await checkAuthStatus();
        if (authStatus.isAuthenticated) {
          console.log("User already authenticated, redirecting to dashboard");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.log("No existing authentication found");
        // User is not authenticated, continue with landing page
      } finally {
        setCheckingAuth(false);
      }
    };

    checkExistingAuth();
  }, [router]);

  // Show loading spinner while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <main className="relative w-full h-screen">
      {/* Background Image */}
      <Image
        src="/img/ankidemy_bg.jpeg"
        alt="Visual Hero de Ankidemy"
        fill
        className="object-cover"
        priority
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-white text-5xl md:text-6xl font-bold mb-4">
          Domina las matemáticas con Ankidemy
        </h1>
        <p className="text-white text-lg md:text-xl mb-8 max-w-2xl">
          Disfruta de rutas de aprendizaje personalizadas y repetición espaciada para retener más y mejor.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-400 transition"
          >
            Regístrate Gratis
          </Link>
          <Link
            href="/login"
            className="border border-white text-white px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
          >
            Iniciar Sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
