import type { ComponentType, HTMLAttributes } from "react";

export const APP_ICON_KEYS = ["add","arhive","arhive-export","arrow-down","arrow-left","arrow-right","arrow-top","back","bag","basket","bed","calendar","candlestick","chart","chat-smile","check-fill","check-ring","chield-check","close-round","colum-up","credit-card","critical","desktop","download","drink","e-mail","edit","expand-down","expand-left","expand-right","favorite","filter","flash","gamepad","gift","group","home","horizontal-switch","key","knife","lamp","layers","line-up","load-circle","meatballs-menu","menu","mobile","money","mortarboard","notebook","oil","package-car","paper","pie-chart","pipette","pizza","refresh","refund-back","road","search","send","setting-alt-line","setting-line","shop","sign-out","sparkle","star","stat","stethoscope","suitcase","table","target","tie","tooth","trash","trophy","user","video","wallet","wallet-alt","water","widget","wifi"] as const;
export type AppIconKey = typeof APP_ICON_KEYS[number];
export interface AppIconProps extends HTMLAttributes<HTMLSpanElement> { size?: number | string }
export type AppIconType = ComponentType<AppIconProps>;

/** The original SVG is a mask so every icon inherits the app's color tokens. */
export function AppIcon({ name, size = 24, style, ...props }: AppIconProps & { name: AppIconKey }) {
  return <span aria-hidden={props["aria-label"] ? undefined : true} role={props["aria-label"] ? "img" : undefined} {...props} style={{
    display: "inline-block", flexShrink: 0, width: size, height: size, backgroundColor: "currentColor",
    maskImage: `url(/icons/lets-icons/${name}.svg)`, maskRepeat: "no-repeat", maskPosition: "center", maskSize: "contain",
    ...style,
  }} />;
}

function icon(name: AppIconKey, rotation = 0): AppIconType {
  return function Icon(props) { return <AppIcon name={name} {...props} style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined, ...props.style }} />; };
}

export const Activity = icon("stat");
export const Archive = icon("arhive");
export const ArchiveRestore = icon("arhive-export");
export const ArrowDownLeft = icon("arrow-down", 45);
export const ArrowDownRight = icon("arrow-down", -45);
export const ArrowLeft = icon("arrow-left");
export const ArrowLeftRight = icon("horizontal-switch");
export const ArrowRight = icon("arrow-right");
export const ArrowRightLeft = icon("horizontal-switch");
export const ArrowUpRight = icon("arrow-top", 45);
export const Banknote = icon("money");
export const CalendarDays = icon("calendar");
export const CarTaxiFront = icon("road");
export const ChartNoAxesColumn = icon("colum-up");
export const ChartNoAxesCombined = icon("chart");
export const Check = icon("check-fill");
export const CheckCircle2 = icon("check-ring");
export const ChevronDown = icon("expand-down");
export const ChevronLeft = icon("expand-left");
export const ChevronRight = icon("expand-right");
export const Coffee = icon("drink");
export const CreditCard = icon("credit-card");
export const Delete = icon("back");
export const Download = icon("download");
export const Ellipsis = icon("meatballs-menu");
export function ExpenseList(props: AppIconProps) {
  return <AppIcon name="paper" {...props} style={{ maskImage: "url(/icons/expense-list.svg)", ...props.style }} />;
}
export const FileSpreadsheet = icon("table");
export const Fuel = icon("oil");
export const House = icon("home");
export const Landmark = icon("notebook");
export const Laptop = icon("desktop");
export const Layers = icon("layers");
export const List = icon("menu");
export const Loader2 = icon("load-circle");
export const LoaderCircle = icon("load-circle");
export const LogOut = icon("sign-out");
export const Mail = icon("e-mail");
export const Pencil = icon("edit");
export const PieChart = icon("pie-chart");
export const PiggyBank = icon("wallet-alt");
export const Plus = icon("add");
export const ReceiptText = icon("paper");
export const RefreshCw = icon("refresh");
export const RotateCcw = icon("refund-back");
export const Search = icon("search");
export const Send = icon("send");
export const Settings = icon("setting-line");
export const Shapes = icon("widget");
export const ShoppingBag = icon("bag");
export const ShoppingCart = icon("basket");
export const SlidersHorizontal = icon("filter");
export const Smartphone = icon("mobile");
export const Target = icon("target");
export const Trash2 = icon("trash");
export const TrendingUp = icon("line-up");
export const TriangleAlert = icon("critical");
export const Undo2 = icon("refund-back");
export const User = icon("user");
export const UtensilsCrossed = icon("knife");
export const Wallet = icon("wallet");
export const X = icon("close-round");
export const Zap = icon("flash");
