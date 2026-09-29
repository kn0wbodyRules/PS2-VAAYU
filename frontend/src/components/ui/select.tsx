import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface SelectContextType {
  value: string
  onValueChange: (val: string) => void
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const SelectContext = React.createContext<SelectContextType | null>(null)

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string
  onValueChange: (val: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative inline-block text-left">{children}</div>
    </SelectContext.Provider>
  )
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(SelectContext)
  if (!ctx) return null

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-xl border border-border bg-[#18181b] px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <span className="material-symbols-outlined text-sm ml-2 text-neutral-400">expand_more</span>
    </button>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext)
  return <span>{ctx?.value || placeholder}</span>
}

export function SelectContent({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(SelectContext)
  if (!ctx || !ctx.open) return null

  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={() => ctx.setOpen(false)} 
      />
      <div
        className={cn(
          "absolute right-0 z-50 mt-1 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-[#18181b] p-1 text-xs text-white shadow-xl animate-in fade-in-80",
          className
        )}
      >
        {children}
      </div>
    </>
  )
}

export function SelectItem({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(SelectContext)
  if (!ctx) return null

  const isSelected = ctx.value === value

  return (
    <div
      onClick={() => {
        ctx.onValueChange(value)
        ctx.setOpen(false)
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-lg px-2.5 py-1.5 text-xs outline-none hover:bg-[#27272a] hover:text-white transition-colors",
        isSelected && "bg-[#27272a] font-semibold text-white",
        className
      )}
    >
      {children}
    </div>
  )
}
