import { Button } from "@/app/components/core/button";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="bg-white w-full min-h-screen flex flex-col gap-7 px-6 sm:px-8 lg:px-16 py-8 mt-16">
      {/* Upper Split */}
      <div className="bg-white grid grid-cols-2 lg:flex lg:flex-row justify-between rounded-lg h-96">
        {/* Upper Left */}
        <div className="text-black flex flex-col pr-10 justify-between w-full">
          <h2 className="text-5xl font-bold">
            Descubre la mejor forma de plantear tu aprendizaje matemático
          </h2>
          <p>
          Ankidemy es un sistema de aprendizaje basado en repetición espaciada, diseñado específicamente para estructuras de conocimiento jerárquicas.
          </p>
          <Button
            size="lg"
            className="bg-orange-400 text-white rounded-xl py-3 hover:bg-orange-300"
          >
            Empieza tu prueba gratis hoy
          </Button>
        </div>

        {/* Upper Right */}
        <div className="w-full relative">
          <Image
            src="/img/landing_1.jpeg"
            alt="Landing Visual 1"
            fill
            className="flex items-center w-full h-full object-cover content-start rounded-2xl"
          />
        </div>
      </div>

      {/* Lower Split */}
      <div className="bg-orange-400 overflow-hidden grid grid-cols-2 h-80 justify-between rounded-2xl">
        {/* Lower Left */}
        <div className="flex relative items-center w-full h-full">
          <Image
            src="/img/landing_2.jpeg"
            fill
            alt="Landing Visual 2"
            className="flex items-center w-full h-full object-cover content-start"
          />
        </div>
        {/* Lower Right */}
        <div className="flex flex-col justify-between py-10 px-8 text-white w-full min-h-full">
          <div className="flex flex-col gap-3">
            <h3 className="text-2xl font-semibold">
              Crea y gestiona rutas de aprendizaje personalizadas
            </h3>
            <p className="text-xl font-semibold">
              Implementa la repetición espaciada en estructuras jerárquicas de conocimiento
            </p>
          </div>
          <a href="/gratis" className="hover:text-orange-800">
            Empieza tu prueba gratis hoy &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}