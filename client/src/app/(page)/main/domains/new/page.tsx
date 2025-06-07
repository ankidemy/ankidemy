"use client";

import React from 'react';
import DomainForm from '@/app/components/Domain/DomainForm';

// Esta página es un alias para la página de creación de dominios
export default function NewDomainPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Create Your First Domain</h1>
      <DomainForm />
    </div>
  );
}
