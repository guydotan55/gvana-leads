import { Suspense } from "react";
import OrganicForm from "@/components/OrganicForm";

export default function StudentFormPage() {
  return (
    <Suspense>
      <OrganicForm type="student" />
    </Suspense>
  );
}
