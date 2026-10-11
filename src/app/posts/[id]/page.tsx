import { redirect } from "next/navigation";

export default async function PostIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/posts/${id}/draft`);
}
