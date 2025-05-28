import React, { forwardRef } from 'react'
// import { Locale } from 'uniswap/src/features/language/constants'
// import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
// import { escapeRegExp } from 'utils/escapeRegExp'

// export function localeUsesComma(locale: Locale): boolean {
//   const decimalSeparator = new Intl.NumberFormat(locale).format(1.1)[1]
//   return decimalSeparator === ','
// }

const inputRegex = /^\d*(?:\.)?\d*$/ // simplified, adapted to normalized input

export interface InputProps extends Omit<React.HTMLProps<HTMLInputElement>, 'ref' | 'onChange' | 'as'> {
  value: string | number
  onUserInput: (input: string) => void
  error?: boolean
  fontSize?: string
  align?: 'right' | 'left'
  prependSymbol?: string
  maxDecimals?: number
  testId?: string
  disabled?: boolean
}

export function isInputGreaterThanDecimals(value: string, maxDecimals?: number): boolean {
  const decimalGroups = value.split('.')
  return !!maxDecimals && decimalGroups.length > 1 && decimalGroups[1].length > maxDecimals
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      value,
      onUserInput,
      placeholder,
      prependSymbol,
      maxDecimals,
      testId,
      error,
      fontSize,
      align = 'right',
      disabled,
      ...rest
    }: InputProps,
    ref,
  ) => {
    const locale = useCurrentLocale()

    const enforcer = (nextUserInput: string) => {
      if (nextUserInput === '' || inputRegex.test(escapeRegExp(nextUserInput))) {
        if (isInputGreaterThanDecimals(nextUserInput, maxDecimals)) return
        onUserInput(nextUserInput)
      }
    }

    const formatValueWithLocale = (val: string | number) => {
      const [searchValue, replaceValue] = localeUsesComma(locale) ? [/\./g, ','] : [/,/g, '.']
      return val.toString().replace(searchValue, replaceValue)
    }

    const valueFormattedWithLocale = formatValueWithLocale(value)

    return (
      <input
        {...rest}
        ref={ref}
        value={prependSymbol && value ? prependSymbol + valueFormattedWithLocale : valueFormattedWithLocale}
        data-testid={testId}
        onChange={(event) => {
          let inputValue = event.target.value
          if (prependSymbol && inputValue.startsWith(prependSymbol)) {
            inputValue = inputValue.slice(prependSymbol.length)
          }
          // Always replace commas with dots internally
          enforcer(inputValue.replace(/,/g, '.'))
        }}
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        type="text"
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder={placeholder || '0'}
        minLength={1}
        maxLength={79}
        spellCheck="false"
        disabled={disabled}
        // Tailwind styles:
        className={`
          w-full
          flex-1
          bg-transparent
          outline-none
          border-none
          whitespace-nowrap
          overflow-hidden
          truncate
          ${error ? 'text-red-600' : 'text-gray-200'}
          ${disabled ? 'pointer-events-none opacity-50' : 'pointer-events-auto'}
          ${align === 'right' ? 'text-right' : 'text-left'}
          ${fontSize ? '' : 'text-[28px]'}
        `}
        style={fontSize ? { fontSize: fontSize, fontWeight: 485 } : { fontWeight: 485 }}
      />
    )
  },
)

Input.displayName = 'SwapInput'

export { SwapInput }
