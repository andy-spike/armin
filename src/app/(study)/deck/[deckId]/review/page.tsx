import { ReviewPage } from "@/components/review-page";

export default async function DeckReviewRoute({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  return <ReviewPage deckId={deckId} />;
}
