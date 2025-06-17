import { useLocalStorage } from "usehooks-ts";

type UseTokenImages = {
	previousImages: string[];
	addImage: (image: string) => void;
	changeMainImage: (index: number) => void;
	deleteImage: (imageLink: string) => void;
};

export default function UseTokenImages(tokenImageQuery?: string) {
	const [previousImages, setPreviousImages] = useLocalStorage<string[]>(tokenImageQuery || "previousImages", []);

	const addImage = (image: string) => {
		// max length of 3, remove the last one if it exceeds
		if (previousImages.length >= 4) {
			previousImages.pop();
		}

		// add the image
		setPreviousImages((prev) => {
			const newImages = [...prev];
			if (image !== undefined && image !== null) {
				newImages.unshift(image);
			}
			return newImages;
		});
	};

	const changeMainImage = (index: number) => {
		// change the order of the images
		const newImages = [...previousImages];
		const image = newImages[index];

		if (!image) {
			return;
		}

		newImages.splice(index, 1);
		newImages.unshift(image);
		setPreviousImages(newImages);
	};

	const deleteImage = (imageLink: string) => {
		for (let i = 0; i < previousImages.length; i++) {
			if (previousImages[i] === imageLink) {
				previousImages.splice(i, 1);
				setPreviousImages([...previousImages]);
				break;
			}
		}
	};

	return {
		previousImages,
		addImage,
		changeMainImage,
		deleteImage,
	} as UseTokenImages;
}
