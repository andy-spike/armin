/** The filters a Browse view sends with its sort; unset ones are omitted. */
export type BrowseQueryFilters = {
  sort: string;
  state?: number;
  deckId?: string;
  tags?: string[];
  search?: string;
};
