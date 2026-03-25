import { Suspense } from "react";
import InstructorForm from "@/components/InstructorForm";

export default function InstructorFormPage() {
  return (
    <Suspense>
      <InstructorForm />
    </Suspense>
  );
}
