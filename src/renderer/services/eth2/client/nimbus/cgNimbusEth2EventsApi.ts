import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {CgEth2EventsApi} from "../eth2ApiClient/cgEth2EventsApi";

export class CgNimbusEth2EventsApi extends CgEth2EventsApi {
    public constructor(config: IBeaconConfig, baseUrl: string) {
        super(config, baseUrl);
    }
}
