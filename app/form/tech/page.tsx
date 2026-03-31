import { Suspense } from "react";
import TechForm from "@/components/TechForm";

export default function TechFormPage() {
  return (
    <Suspense>
      <TechForm />
    </Suspense>
  );
}
