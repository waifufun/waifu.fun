import { useLocalStorage } from "usehooks-ts";

type UseTokenImages = {
	previousImages: string[];
	addImage: (image: string) => void;
	changeMainImage: (index: number) => void;
};

export default function UseTokenImages() {
	const [previousImages, setPreviousImages] = useLocalStorage<string[]>("previousImages", []);

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

	return {
		previousImages,
		addImage,
		changeMainImage,
	} as UseTokenImages;
}
