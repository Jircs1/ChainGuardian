import {
    all,
    call,
    put,
    fork,
    takeEvery,
    PutEffect,
    CallEffect,
    RaceEffect,
    TakeEffect,
    race,
    take,
    ChannelTakeEffect,
    cancel,
} from "redux-saga/effects";
import {getNetworkConfig} from "../../services/eth2/networks";
import {liveProcesses} from "../../services/utils/cmd";
import {cancelDockerPull, endDockerImagePull, startDockerImagePull} from "../network/actions";
import {startLocalBeacon, removeBeacon, addBeacon, addBeacons, updateSlot} from "./actions";
import {BeaconChain} from "../../services/docker/chain";
import {SupportedNetworks} from "../../services/eth2/supportedNetworks";
import database from "../../services/db/api/database";
import {Beacons} from "../../models/beacons";
import {postInit} from "../store";
import {BeaconStatus} from "./slice";
import {HttpClient} from "../../services/api";
import {EventChannel, eventChannel} from "redux-saga";
import {Action} from "redux";
import {CgEth2ApiClient} from "../../services/eth2/client/eth2ApiClient";
import {mainnetConfig} from "@chainsafe/lodestar-config/lib/presets/mainnet";
import {BeaconEventType, HeadEvent} from "@chainsafe/lodestar-validator/lib/api/interface/events";
import {AllEffect, CancelEffect, ForkEffect} from "@redux-saga/core/effects";
import {readBeaconChainNetwork} from "../../services/eth2/client";
import {INetworkConfig} from "../../services/interfaces";

export function* pullDockerImage(
    network: string,
): Generator<PutEffect | RaceEffect<CallEffect | TakeEffect>, boolean, [boolean, Action]> {
    yield put(startDockerImagePull());
    const image = getNetworkConfig(network).dockerConfig.image;
    const [pullSuccess, effect] = yield race([call(BeaconChain.pullImage, image), take(cancelDockerPull)]);
    if (effect) {
        liveProcesses["pullImage"].kill();
    }
    yield put(endDockerImagePull());

    return effect !== undefined ? false : pullSuccess;
}

function* startLocalBeaconSaga({
    payload: {network, chainDataDir, eth1Url, discoveryPort, libp2pPort, rpcPort},
    meta: {onComplete},
}: ReturnType<typeof startLocalBeacon>): Generator<CallEffect | PutEffect, void, BeaconChain> {
    const pullSuccess = yield call(pullDockerImage, network);

    const ports = [
        {local: String(libp2pPort), host: String(libp2pPort)},
        {local: String(rpcPort), host: String(rpcPort)},
    ];
    if (libp2pPort !== discoveryPort) {
        ports.push({local: String(discoveryPort), host: String(discoveryPort)});
    }

    if (pullSuccess) {
        switch (network) {
            default:
                yield put(
                    addBeacon(`http://localhost:${rpcPort}`, {
                        id: (yield call(BeaconChain.startBeaconChain, SupportedNetworks.LOCALHOST, {
                            ports,
                            // eslint-disable-next-line max-len
                            cmd: `lighthouse beacon_node --network ${network} --port ${libp2pPort} --discovery-port ${discoveryPort} --http --http-address 0.0.0.0 --http-port ${rpcPort} --eth1-endpoints ${eth1Url}`,
                            volume: `${chainDataDir}:/root/.lighthouse`,
                        })).getParams().name,
                        network,
                        chainDataDir,
                        eth1Url,
                        discoveryPort,
                        libp2pPort,
                        rpcPort,
                    }),
                );
        }
        onComplete();
    }
}

function* storeBeacon({payload: {url, docker}}: ReturnType<typeof addBeacon>): Generator<Promise<void> | ForkEffect> {
    if (!docker)
        // eslint-disable-next-line no-param-reassign
        docker = {id: "", network: "", chainDataDir: "", eth1Url: "", discoveryPort: "", libp2pPort: "", rpcPort: ""};
    yield database.beacons.upsert({url, docker});
    yield fork(watchOnHead, url);
}

function* removeBeaconSaga({payload}: ReturnType<typeof removeBeacon>): Generator<Promise<[boolean, boolean]>> {
    yield database.beacons.remove(payload);
}

function* initializeBeaconsFromStore(): Generator<
    Promise<Beacons> | PutEffect | Promise<void> | Promise<Response[]> | AllEffect<ForkEffect>,
    void,
    Beacons & ({syncing: boolean; slot: number} | null)[]
> {
    const store = yield database.beacons.get();
    if (store !== null) {
        const {beacons}: Beacons = store;

        yield BeaconChain.startAllLocalBeaconNodes();

        const stats = yield Promise.all(
            beacons.map(({url}) =>
                new HttpClient(url)
                    // eslint-disable-next-line camelcase
                    .get<{data: {is_syncing: boolean; head_slot: number}}>("/eth/v1/node/syncing")
                    .then((response) => ({syncing: response.data.is_syncing, slot: response.data.head_slot}))
                    .catch(() => null),
            ),
        );

        yield all(beacons.map(({url}) => fork(watchOnHead, url)));

        yield put(
            addBeacons(
                beacons.map(({url, docker}, index) => ({
                    url,
                    docker: docker.id !== "" ? docker : undefined,
                    slot: stats[index]?.slot || 0,
                    status:
                        stats[index].syncing !== null
                            ? stats[index].syncing
                                ? BeaconStatus.syncing
                                : BeaconStatus.active
                            : BeaconStatus.offline,
                })),
            ),
        );
    }
}

export function* watchOnHead(
    url: string,
): Generator<
    | EventChannel<HeadEvent>
    | ChannelTakeEffect<HeadEvent>
    | PutEffect
    | CancelEffect
    | RaceEffect<ChannelTakeEffect<HeadEvent> | TakeEffect>
    | Promise<INetworkConfig | null>,
    void,
    EventChannel<HeadEvent> & HeadEvent & [HeadEvent, ReturnType<typeof removeBeacon>] & (INetworkConfig | null)
> {
    const config = yield readBeaconChainNetwork(url);
    const client = new CgEth2ApiClient(config?.eth2Config || mainnetConfig, url);
    const emitter = client.events.getEventStream([BeaconEventType.HEAD]);
    const event = yield eventChannel<HeadEvent>((emit) => {
        (async (): Promise<void> => {
            for await (const event of emitter) {
                emit(event as HeadEvent);
            }
        })();
        return (): void => {
            emitter.stop();
        };
    });

    while (true) {
        try {
            const [payload, cancelAction] = yield race([take(event), take(removeBeacon)]);
            if (cancelAction) {
                if (cancelAction.payload === url) {
                    yield cancel();
                }
                continue;
            }
            yield put(updateSlot(payload.message.slot, url));
        } catch (err) {
            console.error("Head event error:", err.message);
        }
    }
}

export function* beaconSagaWatcher(): Generator {
    yield all([
        takeEvery(startLocalBeacon, startLocalBeaconSaga),
        takeEvery(addBeacon, storeBeacon),
        takeEvery(removeBeacon, removeBeaconSaga),
        takeEvery(postInit, initializeBeaconsFromStore),
    ]);
}
