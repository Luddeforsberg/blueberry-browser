import React from "react";

// Part of the component gallery (GalleryPage.tsx): one titled section.

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-10">
    <h2 className="text-20 font-semibold">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);
