"use client"

import * as React from "react"
import { cn } from "cn"
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import { DIALOG_SPRING } from "@/lib/motion"
import { XIcon } from "lucide-react"

/**
 * Radix dialog with Framer Motion enter/exit animations.
 *
 * Radix normally unmounts its portal the moment `open` flips to false, which
 * makes exit animations impossible. The root therefore mirrors its open state
 * in `DialogOpenContext`, and the portal/content are rendered with
 * `forceMount` inside an `AnimatePresence`: the panel slides up and fades in,
 * the backdrop fades, and both play in reverse before being removed.
 */
const DialogOpenContext = React.createContext(false)

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    Boolean(defaultOpen)
  )
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : uncontrolledOpen

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <DialogOpenContext.Provider value={isOpen}>
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogOpenContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/**
 * Animated backdrop.
 *
 * `useIsPresent()` is `false` only while AnimatePresence plays the exit
 * animation — the one moment where the backdrop may ignore pointer events, so
 * the fading copy cannot swallow clicks aimed at the page underneath.
 *
 * It must never set `pointerEvents` while the dialog is open: Radix locks
 * `body { pointer-events: none }` for modal dialogs and spreads its own
 * `pointerEvents: "auto"` *before* the element style, so an explicit key here
 * makes the whole dialog unclickable.
 */
function DialogAnimatedOverlay({ reduceMotion }: { reduceMotion: boolean }) {
  const isPresent = useIsPresent()

  return (
    <DialogOverlay asChild forceMount>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        style={isPresent ? undefined : { pointerEvents: "none" }}
      />
    </DialogOverlay>
  )
}

interface DialogPanelProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean
  reduceMotion: boolean
}

/**
 * Animated panel. Same pointer-events rule as the backdrop: the resolved
 * element is interactive while present and inert while it animates out.
 */
function DialogPanel({
  className,
  children,
  showCloseButton = true,
  reduceMotion,
  ...props
}: DialogPanelProps) {
  const { t } = useLanguage()
  const isPresent = useIsPresent()
  const transition = reduceMotion
    ? { duration: 0 }
    : DIALOG_SPRING
  // Built as two separate objects on purpose: a `pointerEvents: undefined`
  // entry would still exist as a key, and Radix's `Slot` merges its own
  // `pointerEvents: "auto"` *under* this style, so a present-but-empty key
  // would wipe it and leave the panel unclickable behind the modal scroll lock.
  const style = isPresent
    ? { x: "-50%" }
    : { x: "-50%", pointerEvents: "none" as const }

  return (
    <DialogPrimitive.Content asChild forceMount {...props}>
      <motion.div
        data-slot="dialog-content"
        initial={{ opacity: 0, y: "-48%", scale: 0.98 }}
        animate={{ opacity: 1, y: "-50%", scale: 1 }}
        exit={{ opacity: 0, y: "-48%", scale: 0.98 }}
        transition={transition}
        style={style}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm",
          className
        )}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </motion.div>
    </DialogPrimitive.Content>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const open = React.useContext(DialogOpenContext)
  const reduceMotion = useReducedMotion() ?? false

  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {open && (
          <DialogAnimatedOverlay
            key="dialog-overlay"
            reduceMotion={reduceMotion}
          />
        )}
        {open && (
          <DialogPanel
            key="dialog-content"
            reduceMotion={reduceMotion}
            className={className}
            showCloseButton={showCloseButton}
            {...props}
          >
            {children}
          </DialogPanel>
        )}
      </AnimatePresence>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const { t } = useLanguage()

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t("common.close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
