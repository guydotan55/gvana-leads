import { Suspense } from "react";
import FormBuilder from "@/components/FormBuilder";

export default function NewFormPage() {
  return (
    <Suspense>
      <FormBuilder />
    </Suspense>
  );
}
