import { Suspense } from "react";
import FormBuilder from "@/components/FormBuilder";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <FormBuilder editingId={id} />
    </Suspense>
  );
}
