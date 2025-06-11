"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { getCurrentUser, User } from '@/lib/api';

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setCurrentUser(userData);
      } catch (error) {
        // It's okay if this fails on a public-facing page
        console.log("Not logged in, showing public dashboard.");
      }
    };
    fetchUser();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar currentUser={currentUser} />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto flex flex-col gap-7 px-4 sm:px-6 lg:px-8 py-8">
          {/* Upper Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Upper Left */}
            <div className="text-black flex flex-col gap-6 justify-center">
              <h2 className="text-4xl md:text-5xl font-bold">
                Descubre la mejor forma de plantear tu aprendizaje matemático
              </h2>
              <p className="text-gray-700">
                Ankidemy es un sistema de aprendizaje basado en repetición espaciada, diseñado específicamente para estructuras de conocimiento jerárquicas.
              </p>
              <Link href="/main">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-orange-500 text-white rounded-xl py-3 hover:bg-orange-600"
                >
                  Ir a dominios
                </Button>
              </Link>
            </div>

            {/* Upper Right */}
            <div className="w-full h-64 md:h-96 relative">
              <Image
                src="/img/landing_1.jpeg"
                alt="Landing Visual 1"
                fill
                className="object-cover rounded-2xl"
              />
            </div>
          </div>

          {/* Lower Split */}
          <div className="bg-orange-500 overflow-hidden grid grid-cols-1 md:grid-cols-2 h-auto rounded-2xl">
            {/* Lower Left */}
            <div className="relative w-full h-64 md:h-80 order-first md:order-last">
              <Image
                src="/img/landing_2.jpeg"
                fill
                alt="Landing Visual 2"
                className="object-cover"
              />
            </div>
            {/* Lower Right */}
            <div className="flex flex-col justify-between p-8 text-white w-full min-h-full">
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-semibold">
                  Crea y gestiona rutas de aprendizaje personalizadas
                </h3>
                <p className="text-lg">
                  Implementa la repetición espaciada en estructuras jerárquicas de conocimiento
                </p>
              </div>
              <Link
                href="/main"
                className="text-white font-medium hover:text-orange-200 self-start mt-4 text-lg"
              >
                Ir a dominios →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
