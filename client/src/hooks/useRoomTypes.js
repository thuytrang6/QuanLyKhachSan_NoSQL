import { useQuery } from "@tanstack/react-query";
import { roomsApi } from "../api/rooms";
import { authApi } from "../api/auth";

export const useRoomTypes = () => useQuery({ queryKey: ["room-types"], queryFn: roomsApi.types, staleTime: 10 * 60e3 });

export const useHotel = () => useQuery({ queryKey: ["hotel"], queryFn: authApi.hotel, staleTime: 10 * 60e3, retry: 1 });
