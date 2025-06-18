import { useLocalStorage } from "usehooks-ts";

type MediaType = "audio" | "video" | "image";

type UseTokenMedias = {
	previousImages: string[];
	previousVideos: string[];
	previousAudios: string[];
	addMedia: (link: string, type: MediaType) => void;
	addImage: (image: string) => void;
	addVideo: (video: string) => void;
	addAudio: (audio: string) => void;
	changeMainMedia: (index: number, type: MediaType) => void;
	changeMainImage: (index: number) => void;
	changeMainVideo: (index: number) => void;
	changeMainAudio: (index: number) => void;
	deleteMedia: (mediaLink: string, mediaType: MediaType) => void;
	deleteImage: (imageLink: string) => void;
	deleteVideo: (videoLink: string) => void;
	deleteAudio: (audioLink: string) => void;
};

export default function UseTokenMedia(tokenImageQuery?: string): UseTokenMedias {
	const [previousImages, setPreviousImages] = useLocalStorage<string[]>(`${tokenImageQuery}_images`, []);
	const [previousVideos, setPreviousVideos] = useLocalStorage<string[]>(`${tokenImageQuery}_videos`, []);
	const [previousAudios, setPreviousAudios] = useLocalStorage<string[]>(`${tokenImageQuery}_audios`, []);

	const addMedia = (link: string, type: MediaType) => {
		switch (type) {
			case "image":
				addImage(link);
				break;
			case "video":
				addVideo(link);
				break;
			case "audio":
				addAudio(link);
				break;
		}
	};

	const addImage = (image: string) => {
		// max length of 4, remove the last one if it exceeds
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

	const addVideo = (video: string) => {
		// max length of 4, remove the last one if it exceeds
		if (previousVideos.length >= 4) {
			previousVideos.pop();
		}

		// add the video
		setPreviousVideos((prev) => {
			const newVideos = [...prev];
			if (video !== undefined && video !== null) {
				newVideos.unshift(video);
			}
			return newVideos;
		});
	};

	const addAudio = (audio: string) => {
		// max length of 4, remove the last one if it exceeds
		if (previousAudios.length >= 4) {
			previousAudios.pop();
		}

		// add the audio
		setPreviousAudios((prev) => {
			const newAudios = [...prev];
			if (audio !== undefined && audio !== null) {
				newAudios.unshift(audio);
			}
			return newAudios;
		});
	};

	const changeMainMedia = (index: number, type: MediaType) => {
		switch (type) {
			case "image":
				changeMainImage(index);
				break;
			case "video":
				changeMainVideo(index);
				break;
			case "audio":
				changeMainAudio(index);
				break;
		}
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

	const changeMainVideo = (index: number) => {
		// change the order of the videos
		const newVideos = [...previousVideos];
		const video = newVideos[index];

		if (!video) {
			return;
		}

		newVideos.splice(index, 1);
		newVideos.unshift(video);
		setPreviousVideos(newVideos);
	};

	const changeMainAudio = (index: number) => {
		// change the order of the audios
		const newAudios = [...previousAudios];
		const audio = newAudios[index];

		if (!audio) {
			return;
		}

		newAudios.splice(index, 1);
		newAudios.unshift(audio);
		setPreviousAudios(newAudios);
	};

	const deleteMedia = (mediaLink: string, mediaType: MediaType) => {
		switch (mediaType) {
			case "image":
				deleteImage(mediaLink);
				break;
			case "video":
				deleteVideo(mediaLink);
				break;
			case "audio":
				deleteAudio(mediaLink);
				break;
		}
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

	const deleteVideo = (videoLink: string) => {
		for (let i = 0; i < previousVideos.length; i++) {
			if (previousVideos[i] === videoLink) {
				previousVideos.splice(i, 1);
				setPreviousVideos([...previousVideos]);
				break;
			}
		}
	};

	const deleteAudio = (audioLink: string) => {
		for (let i = 0; i < previousAudios.length; i++) {
			if (previousAudios[i] === audioLink) {
				previousAudios.splice(i, 1);
				setPreviousAudios([...previousAudios]);
				break;
			}
		}
	};

	return {
		previousImages,
		previousVideos,
		previousAudios,
		addMedia,
		addImage,
		addVideo,
		addAudio,
		changeMainMedia,
		changeMainImage,
		changeMainVideo,
		changeMainAudio,
		deleteMedia,
		deleteImage,
		deleteVideo,
		deleteAudio,
	};
}
