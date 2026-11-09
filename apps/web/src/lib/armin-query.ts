export type BrowseQueryFilters = {
  sort: string;
  state?: number;
  deckId?: string;
  tags?: string[];
  search?: string;
  type?: "concept";
};
