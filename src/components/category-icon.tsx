import { Banknote, CarTaxiFront, Coffee, Fuel, House, Laptop, Shapes, ShoppingBag, ShoppingCart, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  banknote: Banknote, "car-taxi-front": CarTaxiFront, coffee: Coffee, fuel: Fuel,
  home: House, laptop: Laptop, "shopping-bag": ShoppingBag, "shopping-cart": ShoppingCart,
  "utensils-crossed": UtensilsCrossed, zap: Zap,
};

export function CategoryIcon({ icon, size = 18 }: { icon?: string | null; size?: number }) {
  const Icon = icon ? ICONS[icon] ?? Shapes : Shapes;
  return <Icon size={size} aria-hidden="true" className="shrink-0" />;
}
