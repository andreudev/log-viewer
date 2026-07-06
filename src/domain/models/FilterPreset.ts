export interface FilterPreset {
  id: string;
  name: string;
  icon: string; // Material Icon name
  filters: {
    activeLevels: string[]; // Serialized as array for LocalStorage / JSON sharing
    activeService: string;
    searchTerm: string;
    isRegexSearch: boolean;
    isPayloadsOnly: boolean;
    dateFrom: string | null;
    dateTo: string | null;
    quickFilter: string;
  };
  createdAt: string;
}
