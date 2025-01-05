import {
	Heading,
	VStack,
	Button,
	HStack,
	Spinner,
	Text,
	Spacer,
} from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { customAlphabet } from "nanoid/non-secure";
import { TriangleAlertIcon } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useWebSocketStore } from "~/stores/webSocket";
import { webSocketService } from "~/services/webSocket";
import { useAuthStore } from "~/stores/auth";
import { Alert } from "~/components/ui/alert";
import { Field } from "~/components/ui/field";
import { PinInput } from "~/components/ui/pin-input";
import { webRTCService } from "~/services/webRTC";
import { useWebRTCStore } from "~/stores/webRTC";

export async function clientLoader() {
	const { id, setId } = useAuthStore.getState();
	if (!id) {
		const id = customAlphabet("0123456789", 6)();
		setId(id);
	}
	const url = `wss://signaling.pexni.com/connect?id=${id}`;
	webSocketService.connect(url);
	webSocketService.registerHandler("offer", (data) => {
		webRTCService.handleOffer(data.from, data.data);
	});
	return null;
}

clientLoader.hydrate = true as const;

const schema = z.object({
	code: z
		.string()
		.min(1, { message: "投屏码不能为空" })
		.length(6, { message: "投屏码长度为6位" }),
});

export default function Home() {
	const { id } = useAuthStore();
	const { remoteStream, connectionState } = useWebRTCStore();

	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (videoRef.current && remoteStream && connectionState === "connected") {
			if (videoRef.current.srcObject !== remoteStream) {
				videoRef.current.srcObject = remoteStream;
			}
		}
	}, [remoteStream, connectionState]);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
	});

	const onSubmit = handleSubmit(async (data) => {
		const { code } = data;
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: true,
			});
			const pc = await webRTCService.connect(code);
			stream.getTracks().forEach((track) => {
				pc.addTrack(track, stream);
			});
		} catch (error) {
			console.error("Error in WebRTC setup:", error);
		}
	});

	return (
		<VStack p={4} pt={24} h="dvh">
			<WebSocketStateComponent />
			<Heading fontSize="xl">投屏码</Heading>
			<Button
				size="xl"
				variant="subtle"
				fontWeight="bold"
				fontSize="2xl"
				letterSpacing={2}
			>
				{id}
			</Button>
			<video
				ref={videoRef}
				autoPlay
				muted
				controls
				hidden={!remoteStream || connectionState !== "connected"}
			/>
			<VStack hidden={connectionState !== "connected"}>
				<Heading>已连接</Heading>
				<Button
					colorPalette="red"
					onClick={() => {
						webRTCService.close();
					}}
				>
					断开连接
				</Button>
			</VStack>
			<VStack
				flex={1}
				maxW="sm"
				mx="auto"
				asChild
				pt={24}
				hidden={connectionState === "connected"}
			>
				<form method="post" onSubmit={onSubmit}>
					<Heading fontSize="xl">我要投屏</Heading>
					<Field
						label="投屏码"
						invalid={!!errors.code}
						errorText={errors.code?.message}
					>
						<PinInput
							count={6}
							placeholder={""}
							pattern="\d"
							{...register("code")}
						/>
					</Field>
					<Button w="full" type="submit">
						提交
					</Button>
				</form>
			</VStack>
		</VStack>
	);
}

function WebSocketStateComponent() {
	const { webSocketState } = useWebSocketStore();
	return (
		<HStack
			pos="fixed"
			top="4"
			left="0"
			w="full"
			px="2"
			zIndex="999"
			justifyContent="center"
			hidden={webSocketState === "connected"}
		>
			<Alert
				variant="subtle"
				status={webSocketState === "connecting" ? "info" : "error"}
				icon={
					webSocketState === "connecting" ? <Spinner /> : <TriangleAlertIcon />
				}
				maxW="sm"
				alignItems="center"
				asChild
			>
				<HStack h="6">
					<Text>
						{webSocketState === "connecting"
							? "正在连接到服务器..."
							: "连接到服务器失败"}
					</Text>
					<Spacer />
					<Button
						hidden={webSocketState === "connecting"}
						size="xs"
						onClick={() => {
							webSocketService.reconnect();
						}}
					>
						重新连接
					</Button>
				</HStack>
			</Alert>
		</HStack>
	);
}
