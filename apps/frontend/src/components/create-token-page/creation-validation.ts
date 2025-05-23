export const nameValidation = {
    required: "Name is required",
    minLength: {
        value: 3,
        message: "Name must be at least 3 characters long",
    },
    maxLength: {
        value: 20,
        message: "Name must be at most 20 characters long",
    },
    pattern: {
        value: /^[a-zA-Z0-9 ]*$/,
        message: "Name can only contain letters, numbers, and spaces",
    },
}

export const tickerValidation = {
    required: "Ticker is required",
    minLength: {
        value: 3,
        message: "Ticker must be at least 3 characters long",
    },
    maxLength: {
        value: 5,
        message: "Ticker must be at most 5 characters long",
    },
    pattern: {
        value: /^[a-zA-Z0-9]*$/,
        message: "Ticker can only contain letters and numbers",
    },
}

export const descriptionValidation = {
    required: "Description is required",
    minLength: {
        value: 10,
        message: "Description must be at least 10 characters long",
    },
    maxLength: {
        value: 200,
        message: "Description must be at most 200 characters long",
    },
    pattern: {
        value: /^[a-zA-Z0-9.,'!?" ]*$/,
        message: "Description can only contain letters, numbers, and basic punctuation",
    },
}