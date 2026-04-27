import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getForm } from "@/lib/forms-repo";
import DynamicForm from "@/components/DynamicForm";

export const dynamic = "force-dynamic";

export default async function PublicDynamicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await getForm(slug);
  if (!form || form.status !== "published") {
    notFound();
  }
  return (
    <Suspense>
      <DynamicForm form={form} />
    </Suspense>
  );
}
