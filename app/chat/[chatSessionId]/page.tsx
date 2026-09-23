import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

type PageProps = {
  params: Promise<{ chatSessionId: string }>;
};

export default async function ChatSessionPage({ params }: PageProps) {
  const { chatSessionId } = await params;

  return <ChatWorkspace chatSessionId={chatSessionId} />;
}
