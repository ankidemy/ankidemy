"use client";

import React from 'react';
import DomainForm from '@/app/components/Domain/DomainForm';

export default function CreateDomainPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Create New Domain</h1>
      <DomainForm />
    </div>
  );
}
