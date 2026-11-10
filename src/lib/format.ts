const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Time not set" : dateFmt.format(d);
};

export const formatFee = (fee: number) => (fee > 0 ? `₹${fee} each` : "Free");
/** "Asha", "Asha and Ben", "Asha, Ben and Chen". */
export const formatList = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export const formatSize =(perSide: number) => `${perSide}-a-side`;
