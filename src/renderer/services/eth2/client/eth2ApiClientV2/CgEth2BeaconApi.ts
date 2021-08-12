import {CgEth2Base} from "./base";
import {
    Api,
    CommitteesFilters,
    StateId,
    EpochCommitteeResponse,
    EpochSyncCommitteeResponse,
    AttestationFilters,
    FinalityCheckpoints,
    ValidatorId,
    ValidatorResponse,
    ValidatorBalance,
    ValidatorFilters,
    ValidatorStatus,
} from "@chainsafe/lodestar-api/lib/routes/beacon";
import {phase0, allForks, Slot, Root, Epoch, altair, ssz, StringType} from "@chainsafe/lodestar-types";
import {BlockHeaderResponse, BlockId} from "@chainsafe/lodestar-api/lib/routes/beacon/block";
import {ForkName} from "@chainsafe/lodestar-params";
import {ContainerType, Json} from "@chainsafe/ssz";
import {publishNewBlock, signedNewAttestation} from "../../../../ducks/validator/actions";
import {matomo} from "../../../tracking";
import querystring from "querystring";
import {ArrayOf} from "@chainsafe/lodestar-api/lib/utils";

export class CgEth2BeaconApi extends CgEth2Base implements Api {
    private blockHeaderContainerType = new ContainerType<BlockHeaderResponse>({
        fields: {
            root: ssz.Root,
            canonical: ssz.Boolean,
            header: ssz.phase0.SignedBeaconBlockHeader,
        },
    });

    private epochCommitteeContainerType = new ContainerType<EpochCommitteeResponse>({
        fields: {
            index: ssz.CommitteeIndex,
            slot: ssz.Slot,
            validators: ssz.phase0.CommitteeIndices,
        },
    });

    private finalityCheckpointsContainerType = new ContainerType<FinalityCheckpoints>({
        fields: {
            previousJustified: ssz.phase0.Checkpoint,
            currentJustified: ssz.phase0.Checkpoint,
            finalized: ssz.phase0.Checkpoint,
        },
    });

    private validatorResponseContainerType = new ContainerType<ValidatorResponse>({
        fields: {
            index: ssz.ValidatorIndex,
            balance: ssz.Gwei,
            status: new StringType<ValidatorStatus>(),
            validator: ssz.phase0.Validator,
        },
    });

    private validatorBalanceContainerType = new ContainerType<ValidatorBalance>({
        fields: {
            index: ssz.ValidatorIndex,
            balance: ssz.Gwei,
        },
    });

    private epochCommitteeResponseContainerType = new ContainerType<EpochCommitteeResponse>({
        fields: {
            index: ssz.CommitteeIndex,
            slot: ssz.Slot,
            validators: ssz.phase0.CommitteeIndices,
        },
    });

    private epochSyncCommitteesResponseContainerType = new ContainerType<EpochSyncCommitteeResponse>({
        fields: {
            validators: ArrayOf(ssz.ValidatorIndex),
            validatorAggregates: ArrayOf(ssz.ValidatorIndex),
        },
    });

    public async getBlock(
        blockId: BlockId,
    ): Promise<{
        data: allForks.SignedBeaconBlock;
    }> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/blocks/${blockId}`);
        return {data: ssz.phase0.SignedBeaconBlock.fromJson(response.data)};
    }

    public async getBlockV2(
        blockId: BlockId,
    ): Promise<{
        data: allForks.SignedBeaconBlock;
        version: ForkName;
    }> {
        const response = await this.get<{data: Json; version: ForkName}>(`/eth/v2/beacon/blocks/${blockId}`);
        return {data: ssz[response.version].SignedBeaconBlock.fromJson(response.data), version: response.version};
    }

    public async getBlockAttestations(
        blockId: BlockId,
    ): Promise<{
        data: phase0.Attestation[];
    }> {
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/blocks/${blockId}/attestations`);
        return {data: response.data.map((data) => ssz.phase0.Attestation.fromJson(data))};
    }

    public async getBlockHeader(
        blockId: BlockId,
    ): Promise<{
        data: BlockHeaderResponse;
    }> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/headers/${blockId}`);
        return {
            data: this.blockHeaderContainerType.fromJson(response.data),
        };
    }

    public async getBlockHeaders(
        filters: Partial<{
            slot: Slot;
            parentRoot: string;
        }>,
    ): Promise<{
        data: BlockHeaderResponse[];
    }> {
        const query = querystring.stringify({
            slot: filters.slot,
            // eslint-disable-next-line camelcase,@typescript-eslint/camelcase
            parent_root: filters.parentRoot,
        });
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/headers?${query}`);
        return {data: response.data.map((data) => this.blockHeaderContainerType.fromJson(data))};
    }

    public async getBlockRoot(
        blockId: BlockId,
    ): Promise<{
        data: Root;
    }> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/blocks/${blockId}/root`);
        return {data: ssz.Root.fromJson(response.data)};
    }

    public async publishBlock(block: allForks.SignedBeaconBlock): Promise<void> {
        await this.post("/eth/v1/beacon/blocks", block);

        if (this.publicKey && this.dispatch) {
            this.dispatch(publishNewBlock(this.publicKey, block.message.proposerIndex, block.message.slot));
        }
        if (process.env.NODE_ENV !== "validator-test" && matomo)
            matomo.trackEvent({category: "block", action: "proposed", value: block.message.slot});
    }

    public async getGenesis(): Promise<{data: phase0.Genesis}> {
        const response = await this.get<{data: Json}>("/eth/v1/beacon/genesis");
        return {data: ssz.phase0.Genesis.fromJson(response.data)};
    }

    public async getEpochCommittees(
        stateId: StateId,
        filters: CommitteesFilters | undefined,
    ): Promise<{data: EpochCommitteeResponse[]}> {
        const query = querystring.stringify({
            slot: filters.slot,
            epoch: filters.epoch,
            index: filters.index,
        });
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/states/${stateId}/committees?${query}`);
        return {data: response.data.map((data) => this.epochCommitteeContainerType.fromJson(data))};
    }

    public async getEpochSyncCommittees(
        stateId: StateId,
        epoch: Epoch | undefined,
    ): Promise<{data: EpochSyncCommitteeResponse}> {
        const query = querystring.stringify({epoch});
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/states/${stateId}/sync_committees?${query}`);
        return {data: this.epochSyncCommitteesResponseContainerType.fromJson(response)};
    }

    public async getPoolAttestations(
        filters: Partial<AttestationFilters> | undefined,
    ): Promise<{data: phase0.Attestation[]}> {
        const query = querystring.stringify({
            slot: filters.slot,
            // eslint-disable-next-line camelcase,@typescript-eslint/camelcase
            committee_index: filters.committeeIndex,
        });
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/pool/attestations?${query}`);
        return {data: response.data.map((data) => ssz.phase0.Attestation.fromJson(data))};
    }

    public async getPoolAttesterSlashings(): Promise<{data: phase0.AttesterSlashing[]}> {
        const response = await this.get<{data: Json[]}>("/eth/v1/beacon/pool/attester_slashings");
        return {data: response.data.map((data) => ssz.phase0.AttesterSlashing.fromJson(data))};
    }

    public async getPoolProposerSlashings(): Promise<{data: phase0.ProposerSlashing[]}> {
        const response = await this.get<{data: Json[]}>("/eth/v1/beacon/pool/proposer_slashings");
        return {data: response.data.map((data) => ssz.phase0.ProposerSlashing.fromJson(data))};
    }

    public async getPoolVoluntaryExits(): Promise<{data: phase0.SignedVoluntaryExit[]}> {
        const response = await this.get<{data: Json[]}>("/eth/v1/beacon/pool/voluntary_exits");
        return {data: response.data.map((data) => ssz.phase0.SignedVoluntaryExit.fromJson(data))};
    }

    public async getStateFinalityCheckpoints(stateId: StateId): Promise<{data: FinalityCheckpoints}> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/states/${stateId}/finality_checkpoints`);
        return {data: this.finalityCheckpointsContainerType.fromJson(response.data)};
    }

    public async getStateFork(stateId: StateId): Promise<{data: phase0.Fork}> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/states/${stateId}/fork`);
        return {data: ssz.phase0.Fork.fromJson(response.data)};
    }

    public async getStateRoot(stateId: StateId): Promise<{data: Root}> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/states/${stateId}/root`);
        return {data: ssz.Root.fromJson(response.data)};
    }

    public async getStateValidator(stateId: StateId, validatorId: ValidatorId): Promise<{data: ValidatorResponse}> {
        const response = await this.get<{data: Json}>(`/eth/v1/beacon/states/${stateId}/validators/${validatorId}`);
        return {data: this.validatorResponseContainerType.fromJson(response.data)};
    }

    public async getStateValidatorBalances(
        stateId: StateId,
        indices: ValidatorId[] | undefined,
    ): Promise<{data: ValidatorBalance[]}> {
        const query = querystring.stringify({
            id: indices,
        });
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/states/${stateId}/validator_balances?${query}`);
        return {data: response.data.map((data) => this.validatorBalanceContainerType.fromJson(data))};
    }

    public async getStateValidators(
        stateId: StateId,
        filters: ValidatorFilters | undefined,
    ): Promise<{data: ValidatorResponse[]}> {
        const query = querystring.stringify({
            id: filters.indices,
            status: filters.statuses,
        });
        const response = await this.get<{data: Json[]}>(`/eth/v1/beacon/states/${stateId}/validators?${query}`);
        return {data: response.data.map((data) => this.validatorResponseContainerType.fromJson(data))};
    }

    public async submitPoolAttestations(attestations: phase0.Attestation[]): Promise<void> {
        const data = attestations.map((attestation) => ssz.phase0.Attestation.toJson(attestation));
        await this.post("/eth/v1/beacon/pool/attestations", data);
        if (this.publicKey && this.dispatch) {
            attestations.forEach((attestation) => {
                const validatorIndexInCommittee = [...attestation.aggregationBits].findIndex((bit) => bit);
                if (validatorIndexInCommittee !== -1)
                    this.dispatch(
                        signedNewAttestation(
                            this.publicKey,
                            ssz.Root.toJson(attestation.data.beaconBlockRoot) as string,
                            attestation.data.index,
                            attestation.data.slot,
                            validatorIndexInCommittee,
                        ),
                    );
            });
        }
    }

    public async submitPoolAttesterSlashing(slashing: phase0.AttesterSlashing): Promise<void> {
        const data = ssz.phase0.AttesterSlashing.toJson(slashing);
        await this.post("/eth/v1/beacon/pool/attester_slashings", data);
    }

    public async submitPoolProposerSlashing(slashing: phase0.ProposerSlashing): Promise<void> {
        const data = ssz.phase0.ProposerSlashing.toJson(slashing);
        await this.post("/eth/v1/beacon/pool/proposer_slashings", data);
    }

    public async submitPoolVoluntaryExit(exit: phase0.SignedVoluntaryExit): Promise<void> {
        const data = ssz.phase0.SignedVoluntaryExit.toJson(exit);
        await this.post("/eth/v1/beacon/pool/voluntary_exits", data);
    }

    public async submitPoolSyncCommitteeSignatures(signatures: altair.SyncCommitteeMessage[]): Promise<void> {
        const data = signatures.map((signature) => ssz.altair.SyncCommitteeMessage.toJson(signature));
        await this.post("/eth/v1/beacon/pool/sync_committees", data);
    }
}
